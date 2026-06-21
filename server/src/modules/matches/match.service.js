import { Job } from '../jobs/job.model.js';
import { normalizeJob } from '../../services/jobNormalizer.js';
import { matchJobToCandidate } from '../../services/matcher.js';
import { Match } from './match.model.js';

export async function runCandidateMatch({ candidate, actor, threshold = 75, limit = 500, maxMatches = 0 }) {
  const safeThreshold = Math.max(0, Math.min(100, Number(threshold ?? 75)));
  const jobs = await Job.find({}).sort({ createdAt: -1 }).limit(Math.min(1000, Number(limit || 500))).lean();

  let matches = jobs
    .map((job) => matchJobToCandidate(job, candidate))
    .filter((match) => match.score >= safeThreshold)
    .sort((a, b) => b.score - a.score);

  if (Number(maxMatches) > 0) {
    matches = matches.slice(0, Number(maxMatches));
  }

  const saved = [];

  for (const match of matches) {
    const job = normalizeJob(match.job);
    const doc = await Match.findOneAndUpdate(
      { candidateId: candidate._id, jobId: job.id },
      {
        candidateId: candidate._id,
        jobId: job.id,
        requestedBy: actor.id,
        score: match.score,
        threshold: safeThreshold,
        status: 'matched',
        matchedSkills: match.matchedSkills,
        missingSkills: match.missingSkills,
        reasonSummary: match.summary,
        jobSnapshot: {
          title: job.title,
          company: job.company,
          location: job.location,
          applyUrl: job.applyUrl || job.url
        },
        matchedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    saved.push({
      ...doc,
      job
    });
  }

  return {
    matches: saved,
    totalScanned: jobs.length,
    threshold: safeThreshold
  };
}

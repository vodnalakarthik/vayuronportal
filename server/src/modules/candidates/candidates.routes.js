import express from 'express';
import { start } from 'workflow/api';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { Application } from '../applications/application.model.js';
import { Job } from '../jobs/job.model.js';
import { AiJobAnalysis } from '../matches/ai-job-analysis.model.js';
import { Match } from '../matches/match.model.js';
import { MatchRun } from '../matches/match-run.model.js';
import { ResumeVersion } from '../resumes/resume-version.model.js';
import { normalizeJob } from '../../services/jobNormalizer.js';
import { generateTailoredResume, getAiMatchPlan, runAiCandidateMatch } from '../../services/aiWorkflow.js';
import { candidateMatchWorkflow } from '../../../workflows/candidate-match.js';
import {
  buildCandidateSearchQuery,
  cleanCandidatePayload,
  findAccessibleCandidate
} from './candidate.service.js';
import { Candidate } from './candidate.model.js';

export const candidatesRouter = express.Router();

candidatesRouter.use(requireAuth);

candidatesRouter.get('/', async (req, res, next) => {
  try {
    const { search = '', sortBy = 'createdAt', sortDir = 'desc' } = req.query;
    const allowedSorts = new Set(['createdAt', 'updatedAt', 'firstName', 'lastName', 'targetTitle', 'yearsOfExperience']);
    const selectedSort = allowedSorts.has(String(sortBy)) ? String(sortBy) : 'createdAt';

    const candidates = await Candidate.find(buildCandidateSearchQuery(search, req.user))
      .sort({ [selectedSort]: sortDir === 'asc' ? 1 : -1 })
      .select('-masterResume.text')
      .populate('createdBy', 'name email role')
      .lean({ virtuals: true });

    res.json({ candidates });
  } catch (error) {
    next(error);
  }
});

candidatesRouter.post('/', async (req, res, next) => {
  try {
    const candidate = await Candidate.create(cleanCandidatePayload(req.body, req.user));

    await recordAudit({
      actor: req.user,
      action: 'candidate.create',
      entityType: 'candidate',
      entityId: candidate._id,
      metadata: { email: candidate.email, createdByRole: req.user.role }
    });

    res.status(201).json({ candidate });
  } catch (error) {
    next(error);
  }
});

candidatesRouter.get('/:id', async (req, res, next) => {
  try {
    const candidate = await findAccessibleCandidate(req.params.id, req.user, { lean: true });
    const [matches, applications] = await Promise.all([
      Match.find({ candidateId: candidate._id, status: { $ne: 'applied' } })
        .sort({ score: -1, preFilterScore: -1, matchedAt: -1 })
        .limit(35)
        .lean(),
      Application.find({ candidateId: candidate._id, ...(req.user.role === 'admin' ? {} : { recruiterId: req.user.id }) })
        .sort({ updatedAt: -1 })
        .lean()
    ]);
    const matchedJobIds = matches.map((match) => match.jobId).filter(Boolean);
    const [matchedJobs, resumeVersions] = matchedJobIds.length
      ? await Promise.all([
          Job.find({ _id: { $in: matchedJobIds } }).lean(),
          ResumeVersion.find({ candidateId: candidate._id, jobId: { $in: matchedJobIds } }).sort({ createdAt: -1 }).lean()
        ])
      : [[], []];
    const jobsById = new Map(matchedJobs.map((job) => [String(job._id), normalizeJob(job)]));
    const latestResumesByJobId = new Map();

    resumeVersions.forEach((resume) => {
      const jobId = String(resume.jobId);
      if (!latestResumesByJobId.has(jobId)) latestResumesByJobId.set(jobId, resume);
    });

    res.json({
      candidate: {
        ...candidate,
        matches,
        applications,
        resumes: [...latestResumesByJobId.values()],
        matchedJobs: matches.map((match) => ({
          ...match,
          job: jobsById.get(String(match.jobId)) || {
            id: String(match.jobId),
            title: match.jobSnapshot?.title,
            company: match.jobSnapshot?.company,
            location: match.jobSnapshot?.location,
            applyUrl: match.jobSnapshot?.applyUrl,
            skills: []
          },
          summary: match.reasonSummary
        })),
        appliedJobs: applications
      }
    });
  } catch (error) {
    next(error);
  }
});

candidatesRouter.put('/:id', async (req, res, next) => {
  try {
    const existing = await findAccessibleCandidate(req.params.id, req.user);
    const payload = cleanCandidatePayload(req.body);
    delete payload.createdBy;
    delete payload.createdByRole;

    Object.assign(existing, payload);
    await existing.save();

    await recordAudit({
      actor: req.user,
      action: 'candidate.update',
      entityType: 'candidate',
      entityId: existing._id
    });

    res.json({ candidate: existing });
  } catch (error) {
    next(error);
  }
});

candidatesRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const candidate = await findAccessibleCandidate(req.params.id, req.user);
    const activeRun = await MatchRun.findOne({
      candidateId: candidate._id,
      status: { $in: ['queued', 'running', 'cancelling'] }
    }).lean();

    if (activeRun) {
      return res.status(409).json({
        message: 'This candidate has an active job analysis. Wait for it to finish before deleting the candidate.'
      });
    }

    const [matches, matchRuns, analyses, resumes, applications] = await Promise.all([
      Match.deleteMany({ candidateId: candidate._id }),
      MatchRun.deleteMany({ candidateId: candidate._id }),
      AiJobAnalysis.deleteMany({ candidateId: candidate._id }),
      ResumeVersion.deleteMany({ candidateId: candidate._id }),
      Application.deleteMany({ candidateId: candidate._id })
    ]);

    await Candidate.deleteOne({ _id: candidate._id });

    const deleted = {
      matches: matches.deletedCount || 0,
      matchRuns: matchRuns.deletedCount || 0,
      analyses: analyses.deletedCount || 0,
      resumes: resumes.deletedCount || 0,
      applications: applications.deletedCount || 0
    };

    await recordAudit({
      actor: req.user,
      action: 'candidate.delete',
      entityType: 'candidate',
      entityId: candidate._id,
      metadata: {
        candidateName: candidate.fullName,
        candidateEmail: candidate.email,
        deleted
      }
    });

    return res.json({
      deleted: true,
      candidateId: String(candidate._id),
      candidateName: candidate.fullName,
      relatedRecords: deleted
    });
  } catch (error) {
    return next(error);
  }
});

candidatesRouter.post('/:id/match', async (req, res, next) => {
  try {
    const candidate = await findAccessibleCandidate(req.params.id, req.user);
    const activeRun = await MatchRun.findOne({
      candidateId: candidate._id,
      status: { $in: ['queued', 'running', 'cancelling'] }
    }).sort({ createdAt: -1 }).lean();

    if (activeRun) {
      return res.status(202).json({ run: activeRun, matches: [], background: true });
    }

    const runOptions = {
      dateScope: req.body.dateScope || (req.body.days === 1 ? 'last1d' : 'last2d'),
      days: req.body.days,
      maxMatches: req.body.maxMatches,
      titleKeywords: Array.isArray(req.body.titleKeywords) ? req.body.titleKeywords : []
    };
    const plan = getAiMatchPlan({
      candidate,
      dateScope: runOptions.dateScope,
      days: runOptions.days,
      titleKeywords: runOptions.titleKeywords
    });
    const totalMatchingJobs = await Job.countDocuments(plan.query);

    const run = await MatchRun.create({
      candidateId: candidate._id,
      requestedBy: req.user.id,
      status: 'queued',
      days: plan.days,
      dateScope: plan.dateScope,
      titleKeywords: plan.titleKeywords,
      totalFetched: totalMatchingJobs,
      totalScanned: Math.min(totalMatchingJobs, 50)
    });

    const actor = {
      id: req.user.id,
      role: req.user.role,
      name: req.user.name,
      email: req.user.email
    };

    const workflowInput = {
      runId: String(run._id),
      candidateId: String(candidate._id),
      actor,
      days: plan.days,
      dateScope: plan.dateScope,
      maxMatches: Number(runOptions.maxMatches || 0),
      titleKeywords: plan.titleKeywords
    };

    if (process.env.VERCEL) {
      await start(candidateMatchWorkflow, [workflowInput]);
    } else {
      setImmediate(async () => {
        try {
          const startedRun = await MatchRun.findOneAndUpdate(
            { _id: run._id, cancelRequested: { $ne: true } },
            { status: 'running', startedAt: new Date() },
            { new: true }
          );

          if (!startedRun) return;

          const result = await runAiCandidateMatch({
            candidate,
            actor,
            days: workflowInput.days,
            dateScope: workflowInput.dateScope,
            maxMatches: workflowInput.maxMatches,
            titleKeywords: workflowInput.titleKeywords,
            shouldCancel: async () => {
              const currentRun = await MatchRun.findById(run._id).select('cancelRequested').lean();
              return currentRun?.cancelRequested === true;
            },
            onProgress: (progress) =>
              MatchRun.findOneAndUpdate(
                { _id: run._id, status: { $in: ['queued', 'running'] } },
                {
                  totalScanned: progress.totalScanned,
                  totalFetched: progress.totalFetched,
                  layer1Passed: progress.layer1Passed,
                  layer1Discarded: progress.layer1Discarded,
                  preFilterPoolSize: progress.preFilterPoolSize,
                  processed: progress.processed,
                  matched: progress.matched,
                  cached: progress.cached,
                  failed: progress.failed,
                  days: progress.days ?? plan.days,
                  dateScope: progress.dateScope || plan.dateScope,
                  titleKeywords: progress.titleKeywords || workflowInput.titleKeywords,
                  currentJobTitle: progress.currentJobTitle,
                  ...(progress.lastError ? { error: progress.lastError } : {})
                }
              )
          });

          const currentRun = await MatchRun.findById(run._id).select('status cancelRequested').lean();
          const cancelled = currentRun?.cancelRequested === true || currentRun?.status === 'cancelled' || result.cancelled;
          await MatchRun.findByIdAndUpdate(run._id, {
            status: cancelled ? 'cancelled' : 'completed',
            totalFetched: result.totalFetched,
            layer1Passed: result.layer1Passed,
            layer1Discarded: result.layer1Discarded,
            preFilterPoolSize: result.preFilterPoolSize,
            qualifiedByClaude: result.qualifiedByClaude,
            totalScanned: result.totalScanned,
            processed: result.processed,
            matched: result.matches.length,
            cached: result.cached,
            days: result.days,
            dateScope: result.dateScope,
            titleKeywords: result.titleKeywords,
            ...(cancelled ? { cancelledAt: currentRun?.cancelledAt || new Date() } : {}),
            completedAt: new Date(),
            currentJobTitle: ''
          });

          await recordAudit({
            actor,
            action: cancelled ? 'match.ai_run_cancelled' : 'match.ai_run',
            entityType: 'candidate',
            entityId: candidate._id,
            metadata: {
              matches: result.matches.length,
              totalScanned: result.totalScanned,
              totalFetched: result.totalFetched,
              cancelled,
              cached: result.cached,
              model: result.aiModel
            }
          });
        } catch (error) {
          await MatchRun.findOneAndUpdate(
            { _id: run._id, status: { $ne: 'cancelled' } },
            {
              status: 'failed',
              error: error.message,
              completedAt: new Date(),
              currentJobTitle: ''
            }
          );
        }
      });
    }

    return res.status(202).json({ run: run.toObject(), matches: [], background: true });
  } catch (error) {
    next(error);
  }
});

candidatesRouter.post('/:candidateId/jobs/:jobId/generate-resume', async (req, res, next) => {
  try {
    const [candidate, job] = await Promise.all([
      findAccessibleCandidate(req.params.candidateId, req.user),
      Job.findById(req.params.jobId).lean()
    ]);

    if (!job) return res.status(404).json({ message: 'Job not found.' });

    const { resume, resumeVersion, structuredResume } = await generateTailoredResume({
      candidate,
      job,
      actor: req.user,
      matchId: req.body.matchId
    });

    await recordAudit({
      actor: req.user,
      action: 'resume.generate',
      entityType: 'resume_version',
      entityId: resumeVersion._id,
      metadata: { candidateId: candidate._id, jobId: job._id, version: resumeVersion.version }
    });

    return res.status(201).json({ resume, resumeVersion, structuredResume });
  } catch (error) {
    next(error);
  }
});

candidatesRouter.post('/:candidateId/jobs/:jobId/apply', async (req, res, next) => {
  try {
    const [candidate, job] = await Promise.all([
      findAccessibleCandidate(req.params.candidateId, req.user),
      Job.findById(req.params.jobId).lean()
    ]);

    if (!job) return res.status(404).json({ message: 'Job not found.' });

    const normalizedJob = normalizeJob(job);
    const application = await Application.findOneAndUpdate(
      { candidateId: candidate._id, jobId: job._id },
      {
        candidateId: candidate._id,
        jobId: job._id,
        recruiterId: req.user.id,
        matchId: req.body.matchId,
        resumeVersionId: req.body.resumeVersionId,
        status: req.body.status || 'applied',
        notes: req.body.notes,
        appliedAt: new Date(),
        jobSnapshot: {
          title: normalizedJob.title,
          company: normalizedJob.company,
          location: normalizedJob.location,
          applyUrl: normalizedJob.applyUrl || normalizedJob.url
        },
        candidateSnapshot: {
          fullName: candidate.fullName,
          email: candidate.email,
          targetTitle: candidate.targetTitle,
          targetTitles: candidate.targetTitles || []
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (req.body.matchId) await Match.findByIdAndUpdate(req.body.matchId, { status: 'applied' });

    await recordAudit({
      actor: req.user,
      action: 'application.apply',
      entityType: 'application',
      entityId: application._id,
      metadata: { candidateId: candidate._id, jobId: job._id }
    });

    return res.status(201).json({ application });
  } catch (error) {
    next(error);
  }
});

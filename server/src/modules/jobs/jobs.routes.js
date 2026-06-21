import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { safeRegex } from '../../shared/utils/safeRegex.js';
import { normalizeJob } from '../../services/jobNormalizer.js';
import { Application } from '../applications/application.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { AiJobAnalysis } from '../matches/ai-job-analysis.model.js';
import { MatchRun } from '../matches/match-run.model.js';
import { Match } from '../matches/match.model.js';
import { ResumeVersion } from '../resumes/resume-version.model.js';
import { Job } from './job.model.js';

export const jobsRouter = express.Router();

jobsRouter.use(requireAuth);

function dateRangeForPreset(preset) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (preset === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(24, 0, 0, 0);
    return { start, end };
  }

  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return { start, end };
  }

  const daysByPreset = {
    last24h: 1,
    last7d: 7,
    last30d: 30
  };

  const days = daysByPreset[preset];
  if (!days) return null;

  start.setDate(start.getDate() - days);
  return { start, end };
}

function dateFieldRange(fields, range) {
  if (!range) return null;

  return {
    $or: fields.flatMap((field) => [
      { [field]: { $gte: range.start, $lt: range.end } },
      { [field]: { $gte: range.start.toISOString(), $lt: range.end.toISOString() } }
    ])
  };
}

function oldPostedJobsQuery(days = 7) {
  const safeDays = Math.max(1, Math.min(365, Number(days) || 7));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - safeDays);
  const cutoffIso = cutoff.toISOString();
  const fields = ['postedAt', 'posted_at', 'datePosted', 'date_posted', 'publishedAt'];

  return {
    days: safeDays,
    cutoff,
    query: {
      $or: fields.flatMap((field) => [
        { [field]: { $lt: cutoff } },
        { [field]: { $lt: cutoffIso } }
      ])
    }
  };
}

async function oldJobCleanupSummary(days) {
  const plan = oldPostedJobsQuery(days);
  const oldJobIds = await Job.find(plan.query).distinct('_id');

  if (!oldJobIds.length) {
    return {
      ...plan,
      oldJobIds,
      appliedJobIds: [],
      counts: {
        jobs: 0,
        matches: 0,
        analyses: 0,
        resumeDraftsToDelete: 0,
        applicationsPreserved: 0,
        resumeVersionsPreserved: 0
      }
    };
  }

  const appliedJobIds = await Application.find({ jobId: { $in: oldJobIds } }).distinct('jobId');
  const nonAppliedJobIds = oldJobIds.filter((jobId) => !appliedJobIds.some((appliedId) => String(appliedId) === String(jobId)));
  const [matches, analyses, resumeDraftsToDelete, applicationsPreserved, resumeVersionsPreserved] = await Promise.all([
    Match.countDocuments({ jobId: { $in: oldJobIds } }),
    AiJobAnalysis.countDocuments({ jobId: { $in: oldJobIds } }),
    nonAppliedJobIds.length ? ResumeVersion.countDocuments({ jobId: { $in: nonAppliedJobIds } }) : 0,
    Application.countDocuments({ jobId: { $in: oldJobIds } }),
    appliedJobIds.length ? ResumeVersion.countDocuments({ jobId: { $in: appliedJobIds } }) : 0
  ]);

  return {
    ...plan,
    oldJobIds,
    appliedJobIds,
    nonAppliedJobIds,
    counts: {
      jobs: oldJobIds.length,
      matches,
      analyses,
      resumeDraftsToDelete,
      applicationsPreserved,
      resumeVersionsPreserved
    }
  };
}

jobsRouter.get('/', async (req, res, next) => {
  try {
    const {
      search = '',
      title = '',
      location = '',
      postedWithin = '',
      fetchedToday = '',
      sortBy = 'createdAt',
      sortDir = 'desc',
      page = 1,
      limit = 24
    } = req.query;

    const and = [];

    if (search) {
      const regex = safeRegex(search);
      and.push({
        $or: [
          { title: regex },
          { jobTitle: regex },
          { position: regex },
          { company: regex },
          { companyName: regex },
          { company_name: regex },
          { organization: regex },
          { employer: regex },
          { description: regex },
          { jobDescription: regex },
          { skills: regex },
          { required_skills: regex }
        ]
      });
    }

    if (title) {
      const regex = safeRegex(title);
      and.push({ $or: [{ title: regex }, { jobTitle: regex }, { position: regex }, { role: regex }] });
    }

    if (location) {
      const regex = safeRegex(location);
      and.push({
        $or: [
          { location: regex },
          { jobLocation: regex },
          { job_location: regex },
          { city: regex },
          { job_city: regex },
          { workLocation: regex },
          { work_location: regex },
          { job_state: regex },
          { job_country: regex }
        ]
      });
    }

    if (postedWithin) {
      const postedRange = dateRangeForPreset(String(postedWithin));
      const postedFilter = dateFieldRange(['postedAt', 'posted_at', 'datePosted', 'date_posted', 'publishedAt'], postedRange);
      if (postedFilter) and.push(postedFilter);
    }

    if (String(fetchedToday) === 'true') {
      const fetchedRange = dateRangeForPreset('today');
      and.push(dateFieldRange(['ingested_at', 'ingestedAt', 'fetchedAt', 'createdAt'], fetchedRange));
    }

    const query = and.length ? { $and: and } : {};
    const sortFieldMap = {
      postedAt: 'posted_at',
      company: 'company_name'
    };
    const allowedSorts = new Set([
      'createdAt',
      'updatedAt',
      'postedAt',
      'posted_at',
      'datePosted',
      'title',
      'jobTitle',
      'company',
      'company_name'
    ]);
    const selectedSort = allowedSorts.has(String(sortBy)) ? sortFieldMap[String(sortBy)] || String(sortBy) : 'createdAt';
    const pageNumber = Math.max(1, Number(page));
    const limitNumber = Math.min(100, Math.max(1, Number(limit)));

    const [jobs, total] = await Promise.all([
      Job.find(query)
        .sort({ [selectedSort]: sortDir === 'asc' ? 1 : -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),
      Job.countDocuments(query)
    ]);

    return res.json({
      jobs: jobs.map(normalizeJob),
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber)
    });
  } catch (error) {
    return next(error);
  }
});

jobsRouter.get('/facets', async (_req, res, next) => {
  try {
    const [locations, titles] = await Promise.all([Job.distinct('location'), Job.distinct('title')]);

    res.json({
      locations: locations.filter(Boolean).slice(0, 200),
      titles: titles.filter(Boolean).slice(0, 200)
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get('/cleanup/preview', requireRole('admin'), async (req, res, next) => {
  try {
    const summary = await oldJobCleanupSummary(req.query.days);
    const activeRuns = await MatchRun.countDocuments({ status: { $in: ['queued', 'running', 'cancelling'] } });

    return res.json({
      days: summary.days,
      cutoff: summary.cutoff,
      activeRuns,
      ...summary.counts
    });
  } catch (error) {
    return next(error);
  }
});

jobsRouter.delete('/cleanup', requireRole('admin'), async (req, res, next) => {
  try {
    const activeRuns = await MatchRun.countDocuments({ status: { $in: ['queued', 'running', 'cancelling'] } });
    if (activeRuns) {
      return res.status(409).json({
        message: `Wait for ${activeRuns} active job analysis run${activeRuns === 1 ? '' : 's'} to finish before deleting old jobs.`
      });
    }

    const summary = await oldJobCleanupSummary(req.query.days);
    if (!summary.oldJobIds.length) {
      return res.json({
        days: summary.days,
        cutoff: summary.cutoff,
        deleted: summary.counts,
        message: 'No jobs older than the selected cutoff were found.'
      });
    }

    const preservedJobIds = summary.appliedJobIds || [];
    const nonAppliedJobIds = summary.nonAppliedJobIds || [];

    const [matches, analyses, resumeDrafts, jobs] = await Promise.all([
      Match.deleteMany({ jobId: { $in: summary.oldJobIds } }),
      AiJobAnalysis.deleteMany({ jobId: { $in: summary.oldJobIds } }),
      nonAppliedJobIds.length ? ResumeVersion.deleteMany({ jobId: { $in: nonAppliedJobIds } }) : { deletedCount: 0 },
      Job.deleteMany({ _id: { $in: summary.oldJobIds } })
    ]);

    await Promise.all([
      Application.updateMany(
        { jobId: { $in: summary.oldJobIds } },
        { $unset: { matchId: 1 } }
      ),
      preservedJobIds.length
        ? ResumeVersion.updateMany({ jobId: { $in: preservedJobIds } }, { $unset: { matchId: 1 } })
        : Promise.resolve()
    ]);

    const deleted = {
      jobs: jobs.deletedCount || 0,
      matches: matches.deletedCount || 0,
      analyses: analyses.deletedCount || 0,
      resumeDrafts: resumeDrafts.deletedCount || 0
    };

    await recordAudit({
      actor: req.user,
      action: 'jobs.cleanup_old',
      entityType: 'job',
      metadata: {
        days: summary.days,
        cutoff: summary.cutoff,
        deleted,
        applicationsPreserved: summary.counts.applicationsPreserved,
        resumeVersionsPreserved: summary.counts.resumeVersionsPreserved
      }
    });

    return res.json({
      days: summary.days,
      cutoff: summary.cutoff,
      deleted,
      applicationsPreserved: summary.counts.applicationsPreserved,
      resumeVersionsPreserved: summary.counts.resumeVersionsPreserved
    });
  } catch (error) {
    return next(error);
  }
});

jobsRouter.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Job not found.' });

    const job = await Job.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ message: 'Job not found.' });

    return res.json({ job: normalizeJob(job) });
  } catch (error) {
    return next(error);
  }
});

import express from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { normalizeJob } from '../../services/jobNormalizer.js';
import { recordAudit } from '../audit/audit.service.js';
import { findAccessibleCandidate } from '../candidates/candidate.service.js';
import { Job } from '../jobs/job.model.js';
import { Match } from '../matches/match.model.js';
import { ResumeVersion } from '../resumes/resume-version.model.js';
import { Application } from './application.model.js';

export const applicationsRouter = express.Router();

applicationsRouter.use(requireAuth);

function visibility(actor) {
  return actor.role === 'admin' ? {} : { recruiterId: actor.id };
}

applicationsRouter.get('/', async (req, res, next) => {
  try {
    const { status, candidateId } = req.query;
    const query = { ...visibility(req.user) };
    if (status) query.status = status;
    if (candidateId) {
      await findAccessibleCandidate(candidateId, req.user, { lean: true });
      query.candidateId = candidateId;
    }

    const applications = await Application.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ applications });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.post('/', async (req, res, next) => {
  try {
    const { candidateId, jobId, matchId, resumeVersionId, status = 'ready_to_apply', notes = '' } = req.body;
    const [candidate, job, resumeVersion] = await Promise.all([
      findAccessibleCandidate(candidateId, req.user),
      Job.findById(jobId).lean(),
      resumeVersionId ? ResumeVersion.findById(resumeVersionId).lean() : null
    ]);

    if (!job) return res.status(404).json({ message: 'Job not found.' });

    const normalizedJob = normalizeJob(job);
    const application = await Application.findOneAndUpdate(
      { candidateId, jobId },
      {
        candidateId,
        jobId,
        recruiterId: req.user.id,
        matchId,
        resumeVersionId: resumeVersion?._id,
        status,
        notes,
        appliedAt: status === 'applied' ? new Date() : undefined,
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

    if (matchId) await Match.findByIdAndUpdate(matchId, { status: status === 'applied' ? 'applied' : 'resume_generated' });

    await recordAudit({
      actor: req.user,
      action: 'application.upsert',
      entityType: 'application',
      entityId: application._id,
      metadata: { candidateId, jobId, status }
    });

    res.status(201).json({ application });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.patch('/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.status) {
      updates.status = req.body.status;
      if (req.body.status === 'applied') updates.appliedAt = new Date();
    }
    if (typeof req.body.notes === 'string') updates.notes = req.body.notes;

    const application = await Application.findOneAndUpdate({ _id: req.params.id, ...visibility(req.user) }, updates, {
      new: true,
      runValidators: true
    });

    if (!application) return res.status(404).json({ message: 'Application not found.' });

    await recordAudit({
      actor: req.user,
      action: 'application.update',
      entityType: 'application',
      entityId: application._id,
      metadata: updates
    });

    res.json({ application });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.delete('/:id', async (req, res, next) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, ...visibility(req.user) });
    if (!application) return res.status(404).json({ message: 'Application not found.' });

    await findAccessibleCandidate(application.candidateId, req.user, { lean: true });
    await Application.deleteOne({ _id: application._id });

    if (application.matchId) {
      await Match.findByIdAndUpdate(application.matchId, { status: 'matched' });
    }

    await recordAudit({
      actor: req.user,
      action: 'application.undo',
      entityType: 'application',
      entityId: application._id,
      metadata: { candidateId: application.candidateId, jobId: application.jobId }
    });

    res.json({ deleted: 1 });
  } catch (error) {
    next(error);
  }
});

import express from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { findAccessibleCandidate } from '../candidates/candidate.service.js';
import { Job } from '../jobs/job.model.js';
import { ResumeVersion } from './resume-version.model.js';
import { generateTailoredResume } from '../../services/aiWorkflow.js';

export const resumesRouter = express.Router();

resumesRouter.use(requireAuth);

resumesRouter.post('/generate', async (req, res, next) => {
  try {
    const { candidateId, jobId, matchId } = req.body;
    const [candidate, job] = await Promise.all([
      findAccessibleCandidate(candidateId, req.user),
      Job.findById(jobId).lean()
    ]);

    if (!job) return res.status(404).json({ message: 'Job not found.' });

    const { resume, resumeVersion, structuredResume } = await generateTailoredResume({
      candidate,
      job,
      actor: req.user,
      matchId,
    });

    await recordAudit({
      actor: req.user,
      action: 'resume.generate',
      entityType: 'resume_version',
      entityId: resumeVersion._id,
      metadata: { candidateId, jobId, version: resumeVersion.version }
    });

    res.status(201).json({ resume, resumeVersion, structuredResume });
  } catch (error) {
    next(error);
  }
});

resumesRouter.get('/candidates/:candidateId', async (req, res, next) => {
  try {
    await findAccessibleCandidate(req.params.candidateId, req.user, { lean: true });
    const resumes = await ResumeVersion.find({ candidateId: req.params.candidateId }).sort({ createdAt: -1 }).lean();
    res.json({ resumes });
  } catch (error) {
    next(error);
  }
});

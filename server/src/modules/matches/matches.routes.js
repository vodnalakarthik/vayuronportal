import express from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { Application } from '../applications/application.model.js';
import { buildCandidateSearchQuery, findAccessibleCandidate } from '../candidates/candidate.service.js';
import { Candidate } from '../candidates/candidate.model.js';
import { Job } from '../jobs/job.model.js';
import { ResumeVersion } from '../resumes/resume-version.model.js';
import { Match } from './match.model.js';
import { MatchRun } from './match-run.model.js';
import { runCandidateMatch } from './match.service.js';
import { runAiCandidateMatch } from '../../services/aiWorkflow.js';

export const matchesRouter = express.Router();

matchesRouter.use(requireAuth);

matchesRouter.get('/runs/:runId', async (req, res, next) => {
  try {
    const run = await MatchRun.findById(req.params.runId).lean();
    if (!run) return res.status(404).json({ message: 'Match run not found.' });

    await findAccessibleCandidate(run.candidateId, req.user, { lean: true });
    res.json({ run });
  } catch (error) {
    next(error);
  }
});

matchesRouter.post('/runs/:runId/cancel', async (req, res, next) => {
  try {
    const run = await MatchRun.findById(req.params.runId);
    if (!run) return res.status(404).json({ message: 'Match run not found.' });

    await findAccessibleCandidate(run.candidateId, req.user, { lean: true });

    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      return res.json({ run, alreadyFinished: true });
    }

    run.cancelRequested = true;
    run.status = 'cancelled';
    run.cancelledAt = new Date();
    run.completedAt = new Date();
    run.currentJobTitle = '';
    run.error = undefined;
    await run.save();

    await recordAudit({
      actor: req.user,
      action: 'match.cancel_requested',
      entityType: 'match_run',
      entityId: run._id,
      metadata: { candidateId: run.candidateId, processed: run.processed, matched: run.matched }
    });

    return res.json({ run });
  } catch (error) {
    return next(error);
  }
});

matchesRouter.get('/candidates/:candidateId/runs/latest', async (req, res, next) => {
  try {
    const candidate = await findAccessibleCandidate(req.params.candidateId, req.user, { lean: true });
    const run = await MatchRun.findOne({ candidateId: candidate._id }).sort({ createdAt: -1 }).lean();
    res.json({ run });
  } catch (error) {
    next(error);
  }
});

matchesRouter.get('/candidates/:candidateId', async (req, res, next) => {
  try {
    await findAccessibleCandidate(req.params.candidateId, req.user, { lean: true });
    const matches = await Match.find({ candidateId: req.params.candidateId }).sort({ score: -1 }).lean();
    res.json({ matches });
  } catch (error) {
    next(error);
  }
});

matchesRouter.delete('/candidates/:candidateId', async (req, res, next) => {
  try {
    const candidate = await findAccessibleCandidate(req.params.candidateId, req.user, { lean: true });
    const activeRun = await MatchRun.findOne({
      candidateId: candidate._id,
      status: { $in: ['queued', 'running', 'cancelling'] }
    }).lean();

    if (activeRun) {
      return res.status(409).json({
        message: 'Wait for the active job analysis to finish before clearing matched jobs.'
      });
    }

    const olderThanDays = Number(req.query.olderThanDays || 0);
    let matchQuery = { candidateId: candidate._id };
    let action = 'match.clear_candidate';

    if (olderThanDays > 0) {
      const safeDays = Math.max(1, Math.min(365, olderThanDays));
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - safeDays);
      const cutoffIso = cutoff.toISOString();
      const fields = ['postedAt', 'posted_at', 'datePosted', 'date_posted', 'publishedAt'];
      const oldJobIds = await Job.find({
        $or: fields.flatMap((field) => [
          { [field]: { $lt: cutoff } },
          { [field]: { $lt: cutoffIso } }
        ])
      }).distinct('_id');

      matchQuery = { ...matchQuery, jobId: { $in: oldJobIds } };
      action = 'match.clear_candidate_old';
    }

    const matches = await Match.find(matchQuery).select('_id').lean();
    const matchIds = matches.map((match) => match._id);
    const result = await Match.deleteMany(matchQuery);

    if (matchIds.length) {
      await Promise.all([
        Application.updateMany({ matchId: { $in: matchIds } }, { $unset: { matchId: 1 } }),
        ResumeVersion.updateMany({ matchId: { $in: matchIds } }, { $unset: { matchId: 1 } })
      ]);
    }

    await recordAudit({
      actor: req.user,
      action,
      entityType: 'candidate',
      entityId: candidate._id,
      metadata: { deleted: result.deletedCount, olderThanDays: olderThanDays || null }
    });

    res.json({ deleted: result.deletedCount, olderThanDays: olderThanDays || null });
  } catch (error) {
    next(error);
  }
});

matchesRouter.delete('/:id', async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: 'Matched job not found.' });

    await findAccessibleCandidate(match.candidateId, req.user, { lean: true });
    await Match.deleteOne({ _id: match._id });

    await recordAudit({
      actor: req.user,
      action: 'match.remove',
      entityType: 'match',
      entityId: match._id,
      metadata: { candidateId: match.candidateId, jobId: match.jobId }
    });

    res.json({ deleted: 1 });
  } catch (error) {
    next(error);
  }
});

matchesRouter.post('/candidates/:candidateId/run', async (req, res, next) => {
  try {
    const candidate = await findAccessibleCandidate(req.params.candidateId, req.user);
    const result = req.body.useLocal === true ? await runCandidateMatch({
      candidate,
      actor: req.user,
      threshold: req.body.threshold,
      limit: req.body.limit,
      maxMatches: req.body.maxMatches
    }) : await runAiCandidateMatch({
      candidate,
      actor: req.user,
      days: req.body.days || 2,
      dateScope: req.body.dateScope,
      maxMatches: req.body.maxMatches,
      titleKeywords: Array.isArray(req.body.titleKeywords) ? req.body.titleKeywords : []
    });

    await recordAudit({
      actor: req.user,
      action: req.body.useLocal === true ? 'match.run' : 'match.ai_run',
      entityType: 'candidate',
      entityId: candidate._id,
      metadata: {
        matches: result.matches.length,
        threshold: result.threshold,
        totalScanned: result.totalScanned,
        days: result.days,
        dateScope: result.dateScope,
        titleKeywords: result.titleKeywords
      }
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

matchesRouter.post('/populate-samples', async (req, res, next) => {
  try {
    const maxCandidates = Math.min(50, Math.max(1, Number(req.body.maxCandidates || 20)));
    const matchesPerCandidate = Math.min(8, Math.max(1, Number(req.body.matchesPerCandidate || 3)));
    const threshold = Math.max(0, Math.min(100, Number(req.body.threshold ?? 0)));

    const candidates = await Candidate.find(buildCandidateSearchQuery('', req.user))
      .sort({ createdAt: -1 })
      .limit(maxCandidates);

    const results = [];

    for (const candidate of candidates) {
      const result = await runCandidateMatch({
        candidate,
        actor: req.user,
        threshold,
        limit: req.body.limit || 250,
        maxMatches: matchesPerCandidate
      });

      results.push({
        candidateId: String(candidate._id),
        candidateName: candidate.fullName,
        matches: result.matches.length
      });
    }

    await recordAudit({
      actor: req.user,
      action: 'match.populate_samples',
      entityType: 'candidate',
      metadata: { candidates: results.length, matchesPerCandidate, threshold }
    });

    res.json({ results, totalCandidates: results.length, matchesPerCandidate, threshold });
  } catch (error) {
    next(error);
  }
});

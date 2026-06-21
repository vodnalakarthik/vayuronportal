import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { bootstrapAdmin } from './services/bootstrapAdmin.js';
import { applicationsRouter } from './modules/applications/applications.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { candidatesRouter } from './modules/candidates/candidates.routes.js';
import { jobsRouter } from './modules/jobs/jobs.routes.js';
import { matchesRouter } from './modules/matches/matches.routes.js';
import { MatchRun } from './modules/matches/match-run.model.js';
import { resumesRouter } from './modules/resumes/resumes.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

const app = express();

app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vayuron-job-portal-api' });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/candidates', candidatesRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/resumes', resumesRouter);
app.use('/api/applications', applicationsRouter);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((error, _req, res, _next) => {
  console.error(error);

  if (error.code === 11000) {
    return res.status(409).json({ message: 'A record with that unique field already exists.' });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: error.message });
  }

  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }

  return res.status(500).json({ message: 'Unexpected server error.' });
});

try {
  await connectDatabase();
  await MatchRun.updateMany(
    { status: { $in: ['queued', 'running', 'cancelling'] } },
    {
      status: 'failed',
      error: 'Analysis was interrupted by a server restart. Start a new match run.',
      completedAt: new Date(),
      currentJobTitle: ''
    }
  );
  await bootstrapAdmin();

  app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });
} catch (error) {
  console.error('API startup failed:', error.message);

  if (error.codeName === 'AtlasError' || /auth/i.test(error.message)) {
    console.error('Check MONGODB_URI, Atlas database user password, and database user permissions.');
  }

  process.exit(1);
}

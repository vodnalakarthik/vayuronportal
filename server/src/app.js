import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env } from './config/env.js';
import { initializeRuntime } from './runtime.js';
import { applicationsRouter } from './modules/applications/applications.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { candidatesRouter } from './modules/candidates/candidates.routes.js';
import { jobsRouter } from './modules/jobs/jobs.routes.js';
import { matchesRouter } from './modules/matches/matches.routes.js';
import { resumesRouter } from './modules/resumes/resumes.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

const app = express();

app.disable('etag');
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(async (_req, _res, next) => {
  try {
    await initializeRuntime();
    next();
  } catch (error) {
    next(error);
  }
});

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

export default app;

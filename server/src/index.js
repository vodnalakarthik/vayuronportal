import app from './app.js';
import { env } from './config/env.js';
import { MatchRun } from './modules/matches/match-run.model.js';
import { initializeRuntime } from './runtime.js';

try {
  await initializeRuntime();
  await MatchRun.updateMany(
    {
      status: { $nin: ['completed', 'cancelled'] },
      cancelRequested: true
    },
    {
      $set: {
        status: 'cancelled',
        cancelledAt: new Date(),
        completedAt: new Date(),
        currentJobTitle: ''
      },
      $unset: { error: 1 }
    }
  );
  await MatchRun.updateMany(
    { status: 'cancelled', cancelRequested: true },
    { $unset: { error: 1 } }
  );
  await MatchRun.updateMany(
    { status: { $in: ['queued', 'running'] }, cancelRequested: { $ne: true } },
    {
      status: 'failed',
      error: 'Analysis was interrupted by a server restart. Start a new match run.',
      completedAt: new Date(),
      currentJobTitle: ''
    }
  );
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

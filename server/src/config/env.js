import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, '../../../.env');

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: rootEnvPath });
dotenv.config();

export const env = {
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGO_DB_NAME || 'vayuron_job_portal',
  jobsCollection: process.env.JOBS_COLLECTION || 'jobs',
  port: Number(process.env.PORT || 5000),
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@vayuron.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicApiUrl: process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages',
  anthropicAnalysisModel: process.env.ANTHROPIC_ANALYSIS_MODEL || 'claude-haiku-4-5-20251001',
  anthropicResumeModel: process.env.ANTHROPIC_RESUME_MODEL || 'claude-sonnet-4-6'
};

if (!env.mongoUri) {
  throw new Error('MONGODB_URI is required. Add it to the root .env file.');
}

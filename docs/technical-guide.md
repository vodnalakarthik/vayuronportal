# Vayuron Job Portal Technical Guide

## Purpose

Vayuron Job Portal is a full-stack recruiting workflow application for managing jobs, candidates, AI job matching, tailored resume generation, and application tracking.

The application is built as a modular monolith:

- React + Vite frontend in `client/`
- Express + MongoDB backend in `server/`
- MongoDB Atlas or local MongoDB for persistence
- Anthropic Claude for AI job analysis and tailored resume generation

## Repository Layout

```text
JobPortal/
  client/
    src/
      App.jsx          Main React application and workflows
      api.js           API client and token handling
      pdfGen.js        Browser-side PDF generator for tailored resumes
      styles.css       Application styling
  server/
    src/
      index.js         Express app entrypoint
      config/          Environment and MongoDB config
      modules/         Business modules and routes
      services/        AI workflow, job normalization, bootstrap admin
      shared/          Auth middleware and shared utilities
  docs/
    architecture.md
    technical-guide.md
  .env.example
  package.json
```

## Core Features

- Admin and recruiter login with JWT authentication.
- Admin can create recruiters and see all candidates/applications.
- Recruiters can manage only their own candidates and applications.
- Jobs are searchable and filterable from the imported MongoDB jobs collection.
- Candidate profiles store target roles, work authorization, locations, and master resume text.
- AI match runs analyze candidate/job fit using four checkpoints.
- Matched jobs are stored with score, verdict, checkpoints, Job DNA, and reason summary.
- Tailored resume generation creates a structured resume JSON per candidate/job pair.
- Browser-side PDF generation downloads tailored resumes without a separate PDF server.
- Applications track applied status and can be undone.

## Technology Stack

Frontend:

- React 19
- Vite 6
- Lucide React icons
- Plain CSS

Backend:

- Node.js ES modules
- Express 4
- Mongoose 8
- JWT auth
- bcryptjs password hashing
- Morgan logging
- Anthropic Messages API

Database:

- MongoDB
- Main collections: `users`, `jobs`, `candidates`, `matches`, `matchruns`, `aijobanalyses`, `resumeversions`, `applications`, `auditlogs`

## Environment Variables

Create a root `.env` file from `.env.example`.

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Required variables:

```text
MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net/?appName=Cluster1
MONGO_DB_NAME=vayuron_job_portal
JOBS_COLLECTION=jobs
PORT=5000
CLIENT_ORIGIN=http://localhost:5173,http://localhost:4173
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=admin@vayuron.com
ADMIN_PASSWORD=admin123
ANTHROPIC_API_KEY=sk-ant-api03-your-key
ANTHROPIC_ANALYSIS_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_RESUME_MODEL=claude-sonnet-4-6
```

Notes:

- `MONGODB_URI` must point to a MongoDB instance that contains the configured jobs collection.
- `JOBS_COLLECTION` defaults to `jobs`.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are used to create the first admin automatically on server startup.
- `ANTHROPIC_API_KEY` is required for AI matching and tailored resume generation.

## Local Setup On A New System

Prerequisites:

- Node.js 20 or newer recommended.
- npm.
- MongoDB Atlas connection string or local MongoDB.
- Anthropic API key.

1. Clone or copy the project folder.

```bash
cd JobPortal
```

2. Install all dependencies.

```bash
npm run install:all
```

This runs installs for the root package, backend, and frontend.

3. Create and configure `.env`.

```bash
cp .env.example .env
```

Edit `.env` with your MongoDB URI, JWT secret, admin credentials, and Anthropic key.

4. Start the backend in one terminal.

```bash
npm run dev:server
```

Backend URL:

```text
http://localhost:5000
```

Health check:

```text
http://localhost:5000/api/health
```

Expected response:

```json
{"ok":true,"service":"vayuron-job-portal-api"}
```

5. Start the frontend in another terminal.

```bash
npm run dev:client
```

Frontend URL:

```text
http://localhost:5173
```

6. Log in.

Use the admin configured in `.env`:

```text
Email: admin@vayuron.com
Password: admin123
```

Change these in `.env` for real deployments.

## Local Development Scripts

Root scripts:

```bash
npm run install:all   # install root, server, and client dependencies
npm run dev:server    # start Express backend with nodemon
npm run dev:client    # start Vite frontend
npm run build         # build frontend production assets
npm start             # start backend with node
```

Backend scripts:

```bash
npm run dev --prefix server
npm start --prefix server
```

Frontend scripts:

```bash
npm run dev --prefix client
npm run build --prefix client
npm run preview --prefix client
```

## Production Build Notes

Build the frontend:

```bash
npm run build
```

The frontend build output is created under:

```text
client/dist/
```

Start the backend:

```bash
npm start
```

This project currently does not serve `client/dist` from Express. For production, deploy the frontend separately through a static host such as Vercel, Netlify, S3/CloudFront, Nginx, or similar, and deploy the backend as a Node service.

Set `VITE_API_URL` for the frontend build if the backend API is not at `http://localhost:5000/api`.

Example:

```bash
VITE_API_URL=https://api.example.com/api npm run build --prefix client
```

On Windows PowerShell:

```powershell
$env:VITE_API_URL="https://api.example.com/api"
npm run build --prefix client
```

## Authentication And Access Control

Authentication:

- `POST /api/auth/login`
- `GET /api/auth/me`

The frontend stores the JWT in `localStorage` under:

```text
vayuron_token
```

Roles:

- `admin`: full access to jobs, all candidates, all applications, and recruiter management.
- `recruiter`: access to all jobs, but only owned candidates and owned applications.

Backend access control is enforced through `requireAuth`, `requireRole`, and candidate ownership checks. The UI is not the source of truth for permissions.

## Backend Modules

```text
server/src/modules/
  applications/  Application workflow and applied status
  audit/         Audit log persistence
  auth/          Login and current-user routes
  candidates/    Candidate profiles, matching trigger, resume/apply shortcuts
  jobs/          Job search and job detail routes
  matches/       Match records, match runs, sample population
  resumes/       Resume generation and resume version lookup
  users/         Recruiter/admin user management
```

## Important API Routes

Auth:

```text
POST /api/auth/login
GET  /api/auth/me
```

Jobs:

```text
GET /api/jobs
GET /api/jobs/facets
GET /api/jobs/cleanup/preview?days=7
DELETE /api/jobs/cleanup?days=7
GET /api/jobs/:id
```

The cleanup routes are admin-only. They remove source jobs older than the cutoff, matched-job records, cached AI analyses, and unused resume drafts. Application records and resume versions associated with applications are preserved through their stored job snapshots.

Candidates:

```text
GET  /api/candidates
POST /api/candidates
GET  /api/candidates/:id
PUT  /api/candidates/:id
POST /api/candidates/:id/match
POST /api/candidates/:candidateId/jobs/:jobId/generate-resume
POST /api/candidates/:candidateId/jobs/:jobId/apply
```

Matches:

```text
GET    /api/matches/runs/:runId
GET    /api/matches/candidates/:candidateId/runs/latest
GET    /api/matches/candidates/:candidateId
DELETE /api/matches/candidates/:candidateId
DELETE /api/matches/candidates/:candidateId?olderThanDays=7
DELETE /api/matches/:id
POST   /api/matches/candidates/:candidateId/run
POST   /api/matches/populate-samples
```

Resumes:

```text
POST /api/resumes/generate
GET  /api/resumes/candidates/:candidateId
```

Applications:

```text
GET    /api/applications
POST   /api/applications
PATCH  /api/applications/:id
DELETE /api/applications/:id
```

Users:

```text
GET   /api/users
POST  /api/users
POST  /api/users/:id/reset-password
PATCH /api/users/:id
```

## AI Job Matching Flow

Entry point:

```text
POST /api/candidates/:id/match
```

Frontend sends:

```json
{
  "dateScope": "all | last2d | last1d",
  "titleKeywords": ["Data Engineer"]
}
```

Backend behavior:

1. Validates candidate access.
2. Prevents duplicate active runs for the same candidate.
3. Builds a MongoDB query from date scope and title keywords.
4. Runs a local sponsorship/clearance hard filter.
5. Extracts ATS technology keywords from each JD and the candidate master resume.
6. Scores and ranks sponsorship-safe jobs by JD skill coverage.
7. Sends only the top 50 ranked jobs to Claude.
8. Creates and updates a durable `MatchRun` record.
9. Saves each Claude-qualified job immediately so it appears while analysis continues.
10. Supports cancellation after the current Claude job finishes.
11. Retains only the top 35 Claude-qualified recommendations.
12. Stores reusable Claude analysis in `aijobanalyses`.

The four AI qualification checkpoints are:

- Job category and functional match.
- Experience fit.
- Sponsorship, authorization, clearance, and location.
- Domain and industry fit.

The UI polls:

```text
GET /api/matches/runs/:runId
GET /api/matches/candidates/:candidateId/runs/latest
POST /api/matches/runs/:runId/cancel
```

Stopping a run preserves matches already found. Already-applied jobs are excluded from future matching pools.

Candidate match cleanup supports clearing every match or only matches whose source jobs were posted more than seven days ago. Application history and generated resume versions are preserved; stale match references are removed from those records.

## Two-Layer Pre-Filter

Layer 1 is a hard sponsorship and clearance filter:

- Candidates who need sponsorship are checked against known no-sponsorship, citizenship-only, and clearance-required phrases.
- A blocker discards the job before any Claude call.
- Citizens, permanent residents, Green Card holders, and EAD holders bypass this layer.

Layer 2 is deterministic ATS skill ranking:

- Technology keywords are extracted from the full JD description only.
- Candidate skills are extracted from the master resume.
- Score is `matched JD skills / total JD skills * 100`.
- Extra candidate skills not present in the JD are ignored.
- JDs with fewer than three detected skills receive a neutral score of 50.
- Jobs are sorted by score, with newest posting date used as the direct tiebreaker.

Constants:

```text
Claude pool: 50 jobs
Final recommendations: 35 jobs
Minimum JD skills for meaningful score: 3
Neutral score: 50
```

Each saved match records its pre-filter score, pre-filter rank, matched pre-filter skills, and missing pre-filter skills.

## Tailored Resume Generation Flow

Entry point from matched job card:

```text
POST /api/candidates/:candidateId/jobs/:jobId/generate-resume
```

Backend behavior:

1. Validates candidate access.
2. Loads the target job.
3. Uses existing match Job DNA if available.
4. If no Job DNA exists, runs job analysis first.
5. Sends master resume, candidate metadata, target job, and Job DNA to Claude.
6. Writes a `ResumeVersion` with structured JSON content.
7. Marks the match as `resume_generated`.
8. Returns structured resume JSON to the frontend.

Frontend behavior:

1. Shows a blocking resume-generation overlay.
2. Disables related actions while generation is in progress.
3. Aborts the frontend request after 3 minutes to avoid infinite loading.
4. Displays a resume draft modal when generation completes.
5. Uses `client/src/pdfGen.js` to generate and download a PDF in the browser.
6. Shows a PDF download action on matched jobs that already have a generated resume.

Prompt version:

```text
vayuron-ai-resume-v2
```

This prompt is designed for JD-specific output:

- Four-sentence JD-mirrored summary.
- Exactly five skill rows.
- Tool-slot strategy from Job DNA.
- Daily-work bullet slot assignment.
- Exactly five dense bullets per employer.
- Domain translation without fabrication.
- Strict JSON output for the PDF generator.

## PDF Generation

The PDF generator is local browser code:

```text
client/src/pdfGen.js
```

It accepts structured resume JSON and returns raw PDF bytes. No server-side PDF renderer is required.

Resume JSON is expected to include keys such as:

```text
name
target_role
contact
summary
skills
experience
education
certifications
projects
achievements
publications
```

## Candidate And Application Workflow

Typical recruiter workflow:

1. Create or select a candidate.
2. Add candidate targeting information and master resume text.
3. Choose job posting date scope.
4. Choose AI match position keywords.
5. Run Match.
6. Expand matched job analysis and checkpoints as needed.
7. Generate tailored resume for a matched job.
8. Download PDF.
9. Mark job as applied.

Applications are persisted in `applications` and can be undone from the candidate detail view.

## Database Notes

The `jobs` collection is assumed to already exist from an external ingestion process. The portal normalizes job fields at read time because imported job records may use different field names, such as:

- `title`, `jobTitle`, `position`, `role`
- `company`, `companyName`, `company_name`
- `postedAt`, `posted_at`, `datePosted`, `publishedAt`
- `location`, `jobLocation`, `job_location`

Skills, education, LinkedIn, and portfolio information are sourced from the master resume rather than duplicated as profile fields.

Candidate-owned records are scoped using backend access checks, not frontend filtering alone.

## Operational Notes

Useful URLs during local development:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:5000
Health:   http://localhost:5000/api/health
```

Common logs in this workspace:

```text
client-dev.log
client-dev.err.log
server-dev.log
server-dev.err.log
```

Common checks:

```bash
npm run build --prefix client
node --check server/src/services/aiWorkflow.js
node --check server/src/modules/candidates/candidates.routes.js
```

On Windows PowerShell:

```powershell
npm run build --prefix client
node --check server\src\services\aiWorkflow.js
node --check server\src\modules\candidates\candidates.routes.js
```

## Troubleshooting

Backend cannot start:

- Confirm `.env` exists at the project root.
- Confirm `MONGODB_URI` is valid.
- Confirm the MongoDB user has read/write access.
- Confirm port `5000` is free.

Frontend cannot reach API:

- Confirm backend is running on `http://localhost:5000`.
- Confirm `VITE_API_URL` if using a non-local API.
- Confirm `CLIENT_ORIGIN` includes the frontend origin.

Login fails:

- Confirm admin was bootstrapped in the database.
- Confirm `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- If an admin already exists, changing `.env` password will not automatically reset the existing user password.

AI matching fails:

- Confirm `ANTHROPIC_API_KEY` is set.
- Confirm Anthropic model names are valid.
- Check backend logs for rate limit or API errors.
- Use limited matching for broad filters if API usage is too high.

Resume generation hangs:

- The frontend aborts the visible request after 3 minutes.
- The backend may still finish saving the resume version after the client aborts.
- Refresh the candidate profile before retrying.

No jobs appear:

- Confirm the configured `JOBS_COLLECTION`.
- Confirm the collection has documents in the configured `MONGO_DB_NAME`.
- Confirm imported jobs use fields supported by `jobNormalizer.js`.

## Current Design Choices

- Modular monolith is preferred for now.
- AI runs are persisted so progress survives navigation.
- Resume PDF generation happens in the browser to avoid server PDF dependencies.
- Backend owns all access control and workflow writes.
- Frontend is optimized for recruiter workflow density rather than marketing presentation.

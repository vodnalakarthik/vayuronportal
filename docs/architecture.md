# Vayuron Job Application Portal Architecture

## Architecture Style

This project should stay a modular monolith until traffic, team size, or deployment needs justify splitting services. The backend is organized by business workflow instead of only technical file type.

Primary domains:

- Auth and users
- Jobs
- Candidates
- Matches
- Resume versions
- Applications
- Audit logs

## Access Model

- `admin`: master user. Can see all jobs, all candidates, all recruiters, all applications, and can create recruiters.
- `recruiter`: can see all jobs, but can only see and manage candidates and applications they created.

Candidate ownership is enforced on the backend with `Candidate.createdBy`, not only hidden in the UI.

## MongoDB Collections

- `users`: admins and recruiters.
- `jobs`: existing imported job collection from cron ingestion.
- `candidates`: candidate profile, skill data, and master resume.
- `matches`: candidate-to-job match runs and explainable score details.
- `resumeversions`: generated resume drafts per candidate/job pair.
- `applications`: application workflow tracking per candidate/job pair.
- `auditlogs`: admin/recruiter actions for traceability.

## AI Integration Points

Matching AI should live behind the matching module:

```text
POST /api/matches/candidates/:candidateId/run
POST /api/candidates/:id/match
```

Resume generation AI should live behind the resume module:

```text
POST /api/resumes/generate
POST /api/candidates/:candidateId/jobs/:jobId/generate-resume
```

Both integrations should write durable workflow records before returning UI output:

- AI matching writes `matches`.
- AI resume generation writes `resume_versions`.
- Applying writes `applications`.

## Backend Module Layout

```text
server/src/modules/
  applications/
  audit/
  auth/
  candidates/
  jobs/
  matches/
  resumes/
  users/
```

Each module owns its schema and routes. Shared middleware and utilities are under `server/src/shared`.

## Frontend Workflow

- Jobs are global for both roles.
- Candidates are scoped by backend access rules.
- Admins get an extra Recruiters page.
- Applications show all workflows for admins and only owned workflows for recruiters.

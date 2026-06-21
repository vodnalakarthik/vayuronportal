# Vayuron Portal: Vercel Deployment

## Production structure

Deploy this repository as two Vercel projects:

| Project | Root directory | Purpose |
|---|---|---|
| `vayuron-portal-web` | `client` | Vite/React single-page application |
| `vayuron-portal-api` | `server` | Express API, Nitro runtime, and durable Vercel Workflow |

This keeps frontend deployments independent from API and workflow deployments while preserving one Git repository.

## Why the backend uses Workflow

Job matching can make up to 50 sequential Claude calls. A normal Express callback started after returning an HTTP response is not reliable in a serverless function because the function can be suspended or terminated.

The candidate match route now starts a Vercel Workflow. The pre-filter runs once, then each Claude job analysis runs as an independent durable step. Progress remains in MongoDB, cancellation is checked between jobs, and completed matches remain available if a run is stopped.

## Prerequisites

- A Vercel account with access to the GitHub repository.
- A MongoDB Atlas cluster reachable from Vercel.
- An Anthropic API key.
- The `main` branch deployed as production.
- Fluid Compute enabled for the API project.

## 1. Deploy the API project first

1. In Vercel, select **Add New > Project**.
2. Import `vodnalakarthik/vayuronportal`.
3. Name the project `vayuron-portal-api`.
4. Set **Root Directory** to `server`.
5. Keep **Framework Preset** as `Other`.
6. The build command is `npm run build`.
7. Add the environment variables below for Production and Preview.

```env
MONGODB_URI=mongodb+srv://...
MONGO_DB_NAME=vayuron_job_portal
JOBS_COLLECTION=jobs
JWT_SECRET=use-a-long-random-production-secret
ADMIN_EMAIL=your-production-admin-email
ADMIN_PASSWORD=use-a-strong-production-password
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_ANALYSIS_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_RESUME_MODEL=claude-sonnet-4-6
CLIENT_ORIGIN=https://temporary-placeholder.example
```

Do not add `PORT`; Vercel controls the function port.

8. Deploy the project.
9. In the API project's Vercel settings, enable **Fluid Compute**.
10. Confirm the API responds:

```text
https://YOUR-API-PROJECT.vercel.app/api/health
```

## 2. Deploy the frontend project

1. Add another Vercel project from the same GitHub repository.
2. Name it `vayuron-portal-web`.
3. Set **Root Directory** to `client`.
4. Vercel should detect **Vite**.
5. Add:

```env
VITE_API_URL=https://YOUR-API-PROJECT.vercel.app/api
```

6. Deploy the frontend.

The `client/vercel.json` rewrite ensures direct navigation to SPA routes loads `index.html`.

## 3. Set the final CORS origin

After the frontend has a production URL:

1. Return to the API project's environment variables.
2. Replace `CLIENT_ORIGIN` with the exact frontend origin:

```env
CLIENT_ORIGIN=https://YOUR-WEB-PROJECT.vercel.app
```

For multiple trusted origins, use a comma-separated list:

```env
CLIENT_ORIGIN=https://portal.example.com,https://vayuron-portal-web.vercel.app
```

3. Redeploy the API project.

## 4. Configure MongoDB Atlas access

Vercel functions do not provide a fixed outbound IP on standard plans. For initial deployment, Atlas must accept connections from Vercel. A common setup is an Atlas network access entry for `0.0.0.0/0`, protected by:

- A dedicated database user with a strong generated password.
- Least-privilege database permissions.
- TLS, which Atlas connection strings use by default.
- No database credentials committed to Git.

For tighter production controls, use Vercel Secure Compute/static egress and allow only those addresses in Atlas.

## 5. Production verification

Test these workflows after both deployments:

1. Open the frontend and sign in.
2. Create or edit a candidate.
3. Start job matching.
4. Confirm the run progresses while navigating away and returning.
5. Stop a run and confirm already-created matches remain.
6. Generate and download a tailored resume.
7. Mark a job applied.
8. Verify admin-only delete and cleanup actions.
9. Review Function and Workflow logs in Vercel.

## Local development

Install dependencies:

```powershell
npm run install:all
```

Start the local API:

```powershell
npm run dev:server
```

Local development uses the in-process matcher so Windows file watching remains stable. Vercel production uses the durable Workflow automatically.

Start the frontend in a second terminal:

```powershell
npm run dev:client
```

Local URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:5000/api/health`

Workflow local state is written to `.workflow-data/` and is ignored by Git.

## Operational notes

- Never put `ANTHROPIC_API_KEY`, `JWT_SECRET`, MongoDB credentials, or admin passwords in frontend environment variables.
- `VITE_*` values are public because Vite embeds them into the browser bundle.
- Preview frontend deployments need their exact origin added to `CLIENT_ORIGIN` before they can call the API.
- Changing backend environment variables requires an API redeployment.
- Vercel Workflow and Queues usage should be monitored because each analyzed job is a workflow step and an Anthropic API request.

# Aura — Clinical Decision Support (linked to the live SEHATI-AI backend)

A React + Vite single-page app wired to the real SEHATI-AI backend: Cognito
login, and every stage of the case lifecycle — AI interview, exam findings,
differential diagnosis, tests, final diagnosis sign-off, and (for admin/
compliance logins) the audit trail — calling the live API Gateway REST API.
No mock/seeded data — everything comes from and goes to the deployed backend.

## Requirements
- [Node.js](https://nodejs.org) version 18 or newer (includes npm). Check with:
  ```
  node --version
  ```

## Run it locally
1. Open a terminal inside this folder (the one containing `package.json`).
2. Copy the env file (already pre-filled with the live, public deployment values — see below):
   ```
   cp .env.example .env
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Start the dev server:
   ```
   npm run dev
   ```
5. Open the URL it prints — usually **http://localhost:5173** — in your browser.

## Environment variables
`.env.example` (and `.env`, gitignored) hold four values pulled straight from
`docs/PROJECT_STATUS.md`'s deployed stack outputs:

| Variable | What it is |
|---|---|
| `VITE_API_URL` | The API Gateway REST base URL (`.../prod/`) |
| `VITE_AWS_REGION` | The Cognito/API region (`us-east-1`) |
| `VITE_USER_POOL_ID` | The Cognito User Pool the app logs into |
| `VITE_USER_POOL_CLIENT_ID` | The Cognito App Client ID (public, no secret) |

These are not secrets (public API URL + public app-client ID, CORS is wide
open on the API) — they're pre-filled so `npm run dev` works immediately.

## Demo login
**Self sign-up is disabled** on the Cognito User Pool — accounts must be
admin-provisioned. If you don't have a working login yet, someone with AWS
CLI access to the account can create one:
```bash
POOL=us-east-1_6JwDuCQQP   # $VITE_USER_POOL_ID

aws cognito-idp admin-create-user --user-pool-id $POOL --username demo.admin \
  --user-attributes Name=email,Value=demo@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password --user-pool-id $POOL --username demo.admin \
  --password 'Passw0rd!Demo' --permanent   # min 12 chars, upper+lower+digit+symbol

aws cognito-idp admin-add-user-to-group --user-pool-id $POOL --username demo.admin --group-name admin
```
An `admin`-group login can exercise the entire lifecycle solo (intake,
interview, exams, differential, tests, final diagnosis sign-off, and the
audit trail) — the other groups are `physician`, `patient`, and `compliance`,
each restricted per `docs/API.md`'s roles table. See `docs/AWS_DEPLOYMENT.md`
Task Set 5 for the full walkthrough, and `docs/API.md`/`docs/DATA_MODEL.md`
for the exact endpoint/field contracts this app is built against.

## Build for production
```
npm run build
```
This creates a `dist/` folder with static HTML/CSS/JS you can upload anywhere
(S3 + CloudFront, Vercel, Netlify, etc.). Preview it locally first with
`npm run preview`.

## Project structure
```
src/
  App.jsx                 app shell, sidebar/topbar, view switch, guided tour
  styles.js                 theme CSS variables + all styling
  main.jsx                    mounts the app, wraps it in AuthProvider
  api/
    client.js                 fetch wrapper: auth header, error normalization
    endpoints.js               one function per backend route
  auth/
    cognito.js                 Cognito InitiateAuth (USER_PASSWORD_AUTH) calls
    AuthContext.jsx             session state, login/logout
  hooks/
    useAsyncAction.js           generic {run, loading, error} for mutations
    useCases.js                 fetches + caches the case list
  views/
    DashboardView.jsx, ListView.jsx, IntakeView.jsx, LoginView.jsx,
    KnowledgeView.jsx, SettingsView.jsx
    case/
      CaseDetailShell.jsx        per-case tab shell (role-aware tab list)
      OverviewTab.jsx, InterviewTab.jsx, ExamsTab.jsx, DifferentialTab.jsx,
      TestsTab.jsx, FinalDiagnosisTab.jsx, AuditTab.jsx, AssistantPanel.jsx
  lib/
    format.js, ui.jsx, ErrorBanner.jsx   shared helpers/small components
```

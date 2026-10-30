# Frontend (React + TypeScript + Vite + Tailwind)

Enterprise-style analyst workspace. **Runs in demo mode**: the ML service is real, but sign-in, cases, reports and the audit log
are stored in this browser (localStorage) because the backend is not built yet. All of that sits behind `src/store/store.ts`, so the
backend can replace it without rewriting the pages.

## Pages
| Route | Page | Permission |
|---|---|---|
| /login, /forgot-password | Sign in (demo accounts shown), reset explanation | public |
| / | Dashboard: real counts from your analyses and cases, no placeholder statistics | analytics.view |
| /analyze | Platform + URL (allowlisted domains), manual public data (blank = UNAVAILABLE), risk score, reasons, model version | profiles.analyze |
| /cases, /cases/:id | Filters by status/risk/platform/date/analyst; evidence with SHA-256, notes, timeline, state-machine actions | cases.view |
| /reports, /reports/:id | Report list, printable preview, Print / Save as PDF | reports.view |
| /admin | Users and permission matrix, audit log, model info, risk thresholds, reset demo data | per tab |
| /profile | Account and role capabilities | any |

## Run
```bash
# 1. ML service (separate terminal, with a trained model)
cd ml-service && MODEL_DIR=./models ACTIVE_MODEL_VERSION=v1 uvicorn app.main:app --port 8000

# 2. Frontend
cd frontend
cp .env.example .env
npm install
npm run dev            # http://localhost:5173
npm run lint && npm run typecheck && npm test && npm run build
```
Demo accounts (password `demo1234`): admin@, analyst@, reviewer@, readonly@ `socialguard.demo`. This is **not real authentication**.

## Try this
1. Sign in as the **Analyst**, open *Analyze profile*, click *Suspicious-looking*, then *Analyze profile*. A HIGH result opens a case automatically.
2. Open the case, move it to *Under review*, add a note and an observation, then try to approve: the button is not offered to an analyst.
3. Sign out, sign in as the **Reviewer**, and approve the case. Generate a report from the case and use *Print / Save as PDF*.
4. As the **Super Admin**, open *Administration*: change the thresholds, read the audit log, see the active model.

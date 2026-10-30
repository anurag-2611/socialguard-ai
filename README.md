# SocialGuard AI

AI-assisted risk assessment of suspicious / impersonating social-media profiles for authorized analysts.
**A risk score is a model signal, not proof of identity, intent or policy violation.**

## Project layout (three independent services)
```
socialguard-ai/
├── frontend/      React + TypeScript + Vite + Tailwind        (7 pages, demo mode, real ML scoring)
├── backend/       Node.js + NestJS + Prisma + PostgreSQL      (health endpoint, schema, domain rules)
├── ml-service/    Python + FastAPI + scikit-learn             (working: trained model, /predict)
├── docs/          requirements, architecture, database, ML design
├── infrastructure/  AWS / Terraform (later)
├── tests/         end-to-end tests (later)
├── docker-compose.yml
└── .github/workflows/ci.yml
```
Each folder has its own dependencies, config, Dockerfile and README, so each can be run, tested and explained on its own.

## Status
| Service | State |
|---|---|
| ml-service | Working: synthetic dataset, Logistic Regression pipeline, evaluation, `/predict` with explanations. 25 tests. |
| backend | Skeleton: `/api/health`, database schema, permission matrix, case state machine. No login or business APIs yet. |
| frontend | Built in demo mode: login, dashboard, analysis, cases, reports, admin. Uses the real ML service; cases, reports and sign-in are stored in the browser until the backend exists. 32 tests. |

## Run
```bash
# ML service (works today)
cd ml-service && pip install -r requirements-dev.txt
MODEL_DIR=./models ACTIVE_MODEL_VERSION=v1 uvicorn app.main:app --port 8000     # http://localhost:8000/docs

# Backend / frontend
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev

# Everything with Docker (untested so far)
cp .env.example .env && docker compose up --build
```

## Docs
`docs/requirements.md` · `docs/architecture/architecture.md` · `docs/database.md` · `docs/ml/ml-design.md`

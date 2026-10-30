# Backend (Node.js + NestJS + TypeScript)

REST API: authentication, permissions, profile analysis orchestration, cases, evidence, reports, audit log.
Talks to PostgreSQL (Prisma), Redis (jobs) and the ML service over HTTP.

```bash
cp .env.example .env
npm install
npm run dev            # http://localhost:3000/api/health
npm run lint && npm run typecheck && npm test
```

Database: see `../docs/database.md` (`npx prisma migrate dev --name init`, `npm run db:integrity`, `npm run db:seed`).

Layout: `src/domain` (permission matrix, case state machine), `prisma/` (schema, integrity SQL, seed). Controllers -> services -> repositories as modules are added.

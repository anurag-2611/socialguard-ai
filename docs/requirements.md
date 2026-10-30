# SocialGuard AI — Requirements Specification (v0.1, Phase 1)

> SocialGuard AI produces a **risk signal**, not proof. It never asserts identity, intent, criminality or policy violation, and it never deletes third-party accounts.

## 1. Purpose and scope
A web platform for authorized analysts to assess publicly accessible social-media profiles for impersonation/fake-account risk, manage review cases, preserve evidence, and prepare official platform reports.

**In scope (MVP):** auth + RBAC, async profile analysis via provider abstraction (Mock + Manual entry), Logistic Regression risk scoring with explanations, configurable risk bands, case workflow with state machine, evidence with SHA-256 integrity, PDF report, audit log, dashboard, Docker Compose, CI, single-environment AWS deployment.

**Out of scope (MVP):** real official-API integrations (interface only), face recognition, scraping, auto-submission of reports, multi-tenancy, production drift monitoring.

## 2. Assumptions
| ID | Assumption |
|---|---|
| A1 | Single-tenant deployment for one organization |
| A2 | TypeScript everywhere; NestJS API; Prisma ORM *(pending user confirmation)* |
| A3 | Only synthetic/demo data exists; model metrics are NOT real-world performance |
| A4 | One AWS environment deployed; staging/prod documented, not fully built *(pending confirmation)* |
| A5 | Analysts supply profile URLs or manually-entered public metrics |

## 3. Roles and permissions
| Permission | Super Admin | Analyst | Reviewer | Read-Only |
|---|:-:|:-:|:-:|:-:|
| users.manage / roles.manage | ✔ | | | |
| config.manage (thresholds, retention) | ✔ | | | |
| models.manage | ✔ | | | |
| audit.view | ✔ | | | |
| analytics.view | ✔ | ✔ | ✔ | ✔ |
| profiles.analyze | | ✔ | | |
| cases.create | | ✔ | | |
| cases.view | ✔ | ✔ | ✔ | ✔ |
| cases.notes.add | | ✔ | ✔ | |
| cases.review (approve/reject/false-positive) | | | ✔ | |
| cases.evidence.add | | ✔ | ✔ | |
| reports.generate / export | | ✔ | ✔ | |
| reports.view | ✔ | ✔ | ✔ | ✔ |

Rules: no self-approval (a reviewer cannot review a case they created); permissions, not role names, are checked in code.

## 4. Functional requirements
| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-1 | Login with email+password (Argon2id), access JWT (~15 min) + rotating refresh token | MUST |
| FR-AUTH-2 | Refresh-token reuse detection revokes the token family | MUST |
| FR-AUTH-3 | Password reset flow | SHOULD |
| FR-RBAC-1 | Every endpoint enforces permission guard; default deny | MUST |
| FR-PROF-1 | Analyst submits platform + profile URL; URL validated against platform allowlist | MUST |
| FR-PROF-2 | Analysis is asynchronous: 202 + job ID, result retrievable | MUST |
| FR-PROF-3 | Provider returns data or marks each field `UNAVAILABLE`; no invented data | MUST |
| FR-FEAT-1 | Feature extraction (ratios, username, text, activity) with zero-division safety | MUST |
| FR-ML-1 | ML service returns probability, model_name/version, dataset_version, feature_schema_version, per-feature contributions | MUST |
| FR-RISK-1 | Risk engine maps probability to LOW/MEDIUM/HIGH using configurable thresholds; snapshot stored with each detection | MUST |
| FR-CASE-1 | HIGH-risk detections auto-create a case `CASE-YYYY-NNNNNN` | MUST |
| FR-CASE-2 | Status changes follow the transition table (section 6); invalid transitions rejected; each recorded in history | MUST |
| FR-EVID-1 | Evidence items carry source, timestamp, type, description, SHA-256 | MUST |
| FR-EVID-2 | No fabricated screenshots/evidence | MUST |
| FR-REP-1 | PDF report incl. indicators, evidence, reviewer, status, disclaimer | MUST |
| FR-REP-2 | ReportingProvider abstraction; default = "Generate Official Report" pack, never fake submission | MUST |
| FR-AUD-1 | Append-only audit log of security-relevant and state-changing actions | MUST |
| FR-DASH-1 | Dashboard shows real aggregates only | MUST |
| FR-PRIV-1 | Retention policy + deletion job; minimal data stored | MUST |
| FR-ADM-1 | Admin UI: users, roles, audit logs, model versions, thresholds | SHOULD |

## 5. Non-functional requirements
| ID | Requirement |
|---|---|
| NFR-SEC-1 | OWASP ASVS L2-aligned controls: validation, rate limiting, Helmet, CORS, CSRF on cookie endpoints, SSRF allowlist, upload validation, request size caps |
| NFR-SEC-2 | No secrets in Git; Secrets Manager in AWS; log redaction of tokens/passwords |
| NFR-PERF-1 | API p95 < 300 ms for non-analysis endpoints; ML `/predict` p95 < 200 ms (target, to be measured) |
| NFR-REL-1 | ML outage must not lose jobs: retry with backoff, dead-letter queue, job status visible |
| NFR-OBS-1 | Structured JSON logs with request ID propagated API → worker → ML |
| NFR-OBS-2 | Metrics: request count/latency/errors, ML latency/failures, queue depth, model version, prediction distribution |
| NFR-TEST-1 | Unit + integration tests in CI; one E2E happy path |
| NFR-PORT-1 | Entire stack runs via `docker compose up` |
| NFR-REPRO-1 | Every prediction reproducible from stored model/dataset/schema versions + thresholds snapshot |

## 6. Case status state machine
| From | Allowed to | Actor |
|---|---|---|
| NEW | UNDER_REVIEW (Analyst or Reviewer), FALSE_POSITIVE, CLOSED (Reviewer only) | Analyst or Reviewer for UNDER_REVIEW; Reviewer only for the rest |
| UNDER_REVIEW | EVIDENCE_REQUIRED, APPROVED_FOR_REPORTING, REJECTED, FALSE_POSITIVE | Reviewer |
| EVIDENCE_REQUIRED | UNDER_REVIEW | Analyst |
| APPROVED_FOR_REPORTING | REPORT_SUBMITTED, UNDER_REVIEW | Analyst (submit) / Reviewer (revoke) |
| REPORT_SUBMITTED | PLATFORM_REVIEW, RESOLVED | Analyst |
| PLATFORM_REVIEW | RESOLVED, CLOSED | Analyst |
| RESOLVED | CLOSED | Reviewer |
| REJECTED | CLOSED, UNDER_REVIEW (reopen) | Reviewer |
| FALSE_POSITIVE | CLOSED | Reviewer |
| CLOSED | — (terminal) | — |

`FALSE_POSITIVE` reviewer outcomes are retained as labeled feedback for future model evaluation.

## 7. Real-world limitations (must appear in README + UI)
1. Platforms control their APIs and enforcement. 2. APIs have permissions, quotas, restrictions. 3. No model can perfectly decide if an account is fake. 4. A risk score is not proof. 5. Public data is incomplete. 6. Synthetic data cannot establish real performance. 7. Validate on representative authorized data before operational use. 8. False positives need active management. 9. Reporting ≠ removal. 10. Legal/privacy review is required before operational deployment.

## 8. Open questions
1. TypeScript + NestJS + Prisma confirmed? 2. Single AWS environment acceptable? 3. Team size / deadline? 4. Organization type (affects which impersonation scenario the demo models: brand, institution, public official)?

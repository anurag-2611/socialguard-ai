/**
 * Demo-mode data store.
 *
 * The backend (authentication, cases, reports, audit) is not built yet. Until it is, this module keeps
 * everything the user actually does in this browser's localStorage, behind plain functions, so the
 * UI can later be pointed at the real REST API by replacing this file. Nothing here is secure:
 * the "login" is a demo switch between roles so the permission-aware UI can be explored.
 */
import { useSyncExternalStore } from 'react';
import { ml } from '../api/ml';
import { checkTransition, type CaseStatus } from '../lib/caseStatus';
import { sha256Hex } from '../lib/hash';
import { can, ROLE_PERMISSIONS, type Permission } from '../lib/permissions';
import { DEFAULT_THRESHOLDS, levelFor, validateThresholds, type Thresholds } from '../lib/risk';
import type {
  Analysis,
  AuditEntry,
  CaseRecord,
  DemoUser,
  Platform,
  ProfileInput,
  ReportRecord,
} from '../lib/types';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_USERS: DemoUser[] = [
  { id: 'u-admin', email: 'admin@socialguard.demo', name: 'Asha Admin', role: 'SUPER_ADMIN' },
  { id: 'u-analyst', email: 'analyst@socialguard.demo', name: 'Arjun Analyst', role: 'ANALYST' },
  { id: 'u-reviewer', email: 'reviewer@socialguard.demo', name: 'Rhea Reviewer', role: 'REVIEWER' },
  { id: 'u-readonly', email: 'readonly@socialguard.demo', name: 'Ravi Read-only', role: 'READ_ONLY' },
];

interface State {
  sessionUserId: string | null;
  analyses: Analysis[];
  cases: CaseRecord[];
  reports: ReportRecord[];
  audit: AuditEntry[];
  thresholds: Thresholds;
  caseCounter: number;
}

const KEY = 'socialguard.demo.v1';
const empty = (): State => ({
  sessionUserId: null,
  analyses: [],
  cases: [],
  reports: [],
  audit: [],
  thresholds: { ...DEFAULT_THRESHOLDS },
  caseCounter: 0,
});

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<State>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function commit(next: State): void {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable: keep working in memory */
  }
  listeners.forEach((l) => l());
}

export function resetStoreForTests(): void {
  localStorage.removeItem(KEY);
  state = empty();
  listeners.forEach((l) => l());
}

export const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getState = (): State => state;
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const nowIso = (): string => new Date().toISOString();

export const userById = (id: string | null | undefined): DemoUser | undefined =>
  DEMO_USERS.find((u) => u.id === id);
export const userName = (id: string | null | undefined): string => userById(id)?.name ?? 'System';

export function currentUser(): DemoUser | null {
  return userById(state.sessionUserId) ?? null;
}

function audit(action: string, entity: string, detail = '', actorId = state.sessionUserId): AuditEntry {
  return { id: uid('a'), at: nowIso(), actorId, action, entity, detail };
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function requirePermission(permission: Permission): { user: DemoUser } | { error: string } {
  const user = currentUser();
  if (!user) return { error: 'You are not signed in.' };
  if (!can(user.role, permission)) return { error: 'Your role does not have permission for this action.' };
  return { user };
}

// ---------------------------------------------------------------- session

export function login(email: string, password: string): Result<{ user: DemoUser }> {
  const user = DEMO_USERS.find((u) => u.email === email.trim().toLowerCase());
  if (!user || password !== DEMO_PASSWORD) {
    commit({ ...state, audit: [...state.audit, audit('LOGIN_FAILED', 'session', email, null)] });
    return { ok: false, error: 'Invalid email or password.' };
  }
  commit({
    ...state,
    sessionUserId: user.id,
    audit: [...state.audit, audit('LOGIN', 'session', user.email, user.id)],
  });
  return { ok: true, user };
}

export function logout(): void {
  commit({ ...state, sessionUserId: null, audit: [...state.audit, audit('LOGOUT', 'session')] });
}

// ---------------------------------------------------------------- analysis

export interface AnalysisRequest {
  platform: Platform;
  profileUrl: string;
  profile: ProfileInput;
}

export async function runAnalysis(
  req: AnalysisRequest,
): Promise<Result<{ analysis: Analysis; caseNumber: string | null }>> {
  const gate = requirePermission('profiles.analyze');
  if ('error' in gate) return { ok: false, error: gate.error };

  const id = uid('an');
  const result = await ml.predict(req.profile, id); // may throw MlError; the caller shows it
  const thresholds = { ...state.thresholds };
  const analysis: Analysis = {
    id,
    platform: req.platform,
    profileUrl: req.profileUrl,
    profile: req.profile,
    result,
    riskLevel: levelFor(result.risk_probability, thresholds),
    thresholdsSnapshot: thresholds,
    analystId: gate.user.id,
    createdAt: nowIso(),
    caseId: null,
  };
  commit({
    ...state,
    analyses: [analysis, ...state.analyses],
    audit: [...state.audit, audit('PROFILE_ANALYZED', `analysis:${id}`, `${analysis.riskLevel} ${result.risk_probability}`)],
  });
  let caseNumber: string | null = null;
  if (analysis.riskLevel === 'HIGH') {
    const created = await createCase(id);
    if (created.ok) caseNumber = created.record.caseNumber;
  }
  const fresh = state.analyses.find((a) => a.id === id) ?? analysis;
  return { ok: true, analysis: fresh, caseNumber };
}

export async function createCase(analysisId: string): Promise<Result<{ record: CaseRecord }>> {
  const gate = requirePermission('cases.create');
  if ('error' in gate) return { ok: false, error: gate.error };
  const analysis = state.analyses.find((a) => a.id === analysisId);
  if (!analysis) return { ok: false, error: 'Analysis not found.' };
  if (analysis.caseId) {
    const existing = state.cases.find((c) => c.id === analysis.caseId);
    if (existing) return { ok: true, record: existing };
  }

  const at = nowIso();
  const profileJson = JSON.stringify(analysis.profile);
  const resultJson = JSON.stringify(analysis.result);
  const counter = state.caseCounter + 1;
  const record: CaseRecord = {
    id: uid('c'),
    caseNumber: `CASE-${new Date().getFullYear()}-${String(counter).padStart(6, '0')}`,
    analysisId,
    status: 'NEW',
    priority: analysis.riskLevel === 'HIGH' ? 'HIGH' : 'NORMAL',
    createdById: gate.user.id,
    assignedAnalystId: gate.user.id,
    assignedReviewerId: null,
    evidence: [
      {
        id: uid('e'),
        type: 'PROFILE_METADATA',
        source: `${analysis.platform} profile data entered by analyst`,
        description: 'Public profile values submitted for analysis (unavailable fields left empty).',
        sha256: await sha256Hex(profileJson),
        capturedAt: analysis.createdAt,
        createdById: gate.user.id,
      },
      {
        id: uid('e'),
        type: 'MODEL_OUTPUT',
        source: `${analysis.result.model_name} ${analysis.result.model_version}`,
        description: `Model risk probability ${analysis.result.risk_probability} with feature contributions (MODEL SIGNAL).`,
        sha256: await sha256Hex(resultJson),
        capturedAt: analysis.createdAt,
        createdById: gate.user.id,
      },
    ],
    notes: [],
    history: [{ id: uid('h'), from: null, to: 'NEW', byId: gate.user.id, reason: 'Case created', at }],
    resolution: null,
    createdAt: at,
    updatedAt: at,
  };
  commit({
    ...state,
    caseCounter: counter,
    cases: [record, ...state.cases],
    analyses: state.analyses.map((a) => (a.id === analysisId ? { ...a, caseId: record.id } : a)),
    audit: [...state.audit, audit('CASE_CREATED', `case:${record.caseNumber}`, analysis.riskLevel)],
  });
  return { ok: true, record };
}

// ---------------------------------------------------------------- cases

function patchCase(id: string, fn: (c: CaseRecord) => CaseRecord, entry: AuditEntry): void {
  commit({
    ...state,
    cases: state.cases.map((c) => (c.id === id ? fn({ ...c, updatedAt: nowIso() }) : c)),
    audit: [...state.audit, entry],
  });
}

export function changeStatus(caseId: string, to: CaseStatus, reason: string): Result {
  const user = currentUser();
  if (!user) return { ok: false, error: 'You are not signed in.' };
  const record = state.cases.find((c) => c.id === caseId);
  if (!record) return { ok: false, error: 'Case not found.' };
  const check = checkTransition(record.status, to, ROLE_PERMISSIONS[user.role], {
    actorId: user.id,
    caseCreatorId: record.createdById,
  });
  if (!check.allowed) {
    const message = {
      INVALID_TRANSITION: `A case cannot move from ${record.status} to ${to}.`,
      FORBIDDEN: 'Your role is not allowed to make this change.',
      SELF_APPROVAL: 'You cannot make a review decision on a case you created.',
    }[check.reason];
    commit({ ...state, audit: [...state.audit, audit('STATUS_CHANGE_DENIED', `case:${record.caseNumber}`, `${record.status} -> ${to}: ${check.reason}`)] });
    return { ok: false, error: message };
  }
  const closing = ['RESOLVED', 'REJECTED', 'FALSE_POSITIVE', 'CLOSED'].includes(to);
  patchCase(
    caseId,
    (c) => ({
      ...c,
      status: to,
      assignedReviewerId:
        c.assignedReviewerId ?? (can(user.role, 'cases.review') ? user.id : null),
      resolution: closing && reason.trim() ? reason.trim() : c.resolution,
      history: [
        ...c.history,
        { id: uid('h'), from: c.status, to, byId: user.id, reason: reason.trim(), at: nowIso() },
      ],
    }),
    audit('CASE_STATUS_CHANGED', `case:${record.caseNumber}`, `${record.status} -> ${to}`),
  );
  return { ok: true };
}

export function addNote(caseId: string, body: string): Result {
  const gate = requirePermission('cases.notes.add');
  if ('error' in gate) return { ok: false, error: gate.error };
  const text = body.trim();
  if (!text) return { ok: false, error: 'Write a note first.' };
  if (text.length > 2000) return { ok: false, error: 'Notes are limited to 2000 characters.' };
  const record = state.cases.find((c) => c.id === caseId);
  if (!record) return { ok: false, error: 'Case not found.' };
  patchCase(
    caseId,
    (c) => ({ ...c, notes: [...c.notes, { id: uid('n'), authorId: gate.user.id, body: text, createdAt: nowIso() }] }),
    audit('NOTE_ADDED', `case:${record.caseNumber}`),
  );
  return { ok: true };
}

export async function addEvidence(caseId: string, description: string): Promise<Result> {
  const gate = requirePermission('cases.evidence.add');
  if ('error' in gate) return { ok: false, error: gate.error };
  const text = description.trim();
  if (!text) return { ok: false, error: 'Describe the observation.' };
  if (text.length > 2000) return { ok: false, error: 'Descriptions are limited to 2000 characters.' };
  const record = state.cases.find((c) => c.id === caseId);
  if (!record) return { ok: false, error: 'Case not found.' };
  const at = nowIso();
  const sha256 = await sha256Hex(`${text}|${at}|${gate.user.id}`);
  patchCase(
    caseId,
    (c) => ({
      ...c,
      evidence: [
        ...c.evidence,
        {
          id: uid('e'),
          type: 'ANALYST_OBSERVATION',
          source: `Analyst observation by ${gate.user.name}`,
          description: text,
          sha256,
          capturedAt: at,
          createdById: gate.user.id,
        },
      ],
    }),
    audit('EVIDENCE_ADDED', `case:${record.caseNumber}`),
  );
  return { ok: true };
}

// ---------------------------------------------------------------- reports

export async function generateReport(caseId: string): Promise<Result<{ report: ReportRecord }>> {
  const gate = requirePermission('reports.generate');
  if ('error' in gate) return { ok: false, error: gate.error };
  const record = state.cases.find((c) => c.id === caseId);
  const analysis = record && state.analyses.find((a) => a.id === record.analysisId);
  if (!record || !analysis) return { ok: false, error: 'Case not found.' };

  const snapshot: ReportRecord['snapshot'] = {
    platform: analysis.platform,
    profileUrl: analysis.profileUrl,
    detectionTime: analysis.createdAt,
    riskProbability: analysis.result.risk_probability,
    riskLevel: analysis.riskLevel,
    modelName: analysis.result.model_name,
    modelVersion: analysis.result.model_version,
    datasetVersion: analysis.result.dataset_version,
    indicators: analysis.result.contributions.map((c) => ({
      label: c.label,
      value: c.value,
      contribution: c.contribution,
    })),
    unavailable: analysis.result.unavailable_fields,
    evidence: record.evidence.map((e) => ({
      type: e.type,
      source: e.source,
      capturedAt: e.capturedAt,
      sha256: e.sha256,
      description: e.description,
    })),
    status: record.status,
    reviewer: record.assignedReviewerId ? userName(record.assignedReviewerId) : null,
  };
  const report: ReportRecord = {
    id: uid('r'),
    caseId,
    caseNumber: record.caseNumber,
    generatedAt: nowIso(),
    generatedById: gate.user.id,
    provider: 'manual-export',
    sha256: await sha256Hex(JSON.stringify(snapshot)),
    snapshot,
  };
  commit({
    ...state,
    reports: [report, ...state.reports],
    audit: [...state.audit, audit('REPORT_GENERATED', `case:${record.caseNumber}`, report.id)],
  });
  return { ok: true, report };
}

// ---------------------------------------------------------------- admin

export function setThresholds(t: Thresholds): Result {
  const gate = requirePermission('config.manage');
  if ('error' in gate) return { ok: false, error: gate.error };
  const problem = validateThresholds(t);
  if (problem) return { ok: false, error: problem };
  commit({
    ...state,
    thresholds: { ...t },
    audit: [...state.audit, audit('THRESHOLDS_CHANGED', 'config', `low=${t.low} medium=${t.medium}`)],
  });
  return { ok: true };
}

export function resetDemoData(): Result {
  const gate = requirePermission('config.manage');
  if ('error' in gate) return { ok: false, error: gate.error };
  commit({
    ...empty(),
    sessionUserId: state.sessionUserId,
    thresholds: state.thresholds,
    audit: [audit('DEMO_DATA_RESET', 'system')],
  });
  return { ok: true };
}

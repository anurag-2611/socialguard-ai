import type { Permission } from './permissions';

export const CASE_STATUSES = [
  'NEW',
  'UNDER_REVIEW',
  'EVIDENCE_REQUIRED',
  'APPROVED_FOR_REPORTING',
  'REPORT_SUBMITTED',
  'PLATFORM_REVIEW',
  'RESOLVED',
  'REJECTED',
  'FALSE_POSITIVE',
  'CLOSED',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const STATUS_LABEL: Record<CaseStatus, string> = {
  NEW: 'New',
  UNDER_REVIEW: 'Under review',
  EVIDENCE_REQUIRED: 'Evidence required',
  APPROVED_FOR_REPORTING: 'Approved for reporting',
  REPORT_SUBMITTED: 'Report submitted',
  PLATFORM_REVIEW: 'Platform review',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
  FALSE_POSITIVE: 'False positive',
  CLOSED: 'Closed',
};

interface Transition {
  to: CaseStatus;
  anyOf: readonly Permission[];
}

const ANALYST: readonly Permission[] = ['cases.create'];
const REVIEW: readonly Permission[] = ['cases.review'];

/** Mirrors backend/src/domain/case-status.ts. */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly Transition[]> = {
  NEW: [
    { to: 'UNDER_REVIEW', anyOf: ['cases.create', 'cases.review'] },
    { to: 'FALSE_POSITIVE', anyOf: REVIEW },
    { to: 'CLOSED', anyOf: REVIEW },
  ],
  UNDER_REVIEW: [
    { to: 'EVIDENCE_REQUIRED', anyOf: REVIEW },
    { to: 'APPROVED_FOR_REPORTING', anyOf: REVIEW },
    { to: 'REJECTED', anyOf: REVIEW },
    { to: 'FALSE_POSITIVE', anyOf: REVIEW },
  ],
  EVIDENCE_REQUIRED: [{ to: 'UNDER_REVIEW', anyOf: ANALYST }],
  APPROVED_FOR_REPORTING: [
    { to: 'REPORT_SUBMITTED', anyOf: ANALYST },
    { to: 'UNDER_REVIEW', anyOf: REVIEW },
  ],
  REPORT_SUBMITTED: [
    { to: 'PLATFORM_REVIEW', anyOf: ANALYST },
    { to: 'RESOLVED', anyOf: ANALYST },
  ],
  PLATFORM_REVIEW: [
    { to: 'RESOLVED', anyOf: ANALYST },
    { to: 'CLOSED', anyOf: ANALYST },
  ],
  RESOLVED: [{ to: 'CLOSED', anyOf: REVIEW }],
  REJECTED: [
    { to: 'CLOSED', anyOf: REVIEW },
    { to: 'UNDER_REVIEW', anyOf: REVIEW },
  ],
  FALSE_POSITIVE: [{ to: 'CLOSED', anyOf: REVIEW }],
  CLOSED: [],
};

export type TransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: 'INVALID_TRANSITION' | 'FORBIDDEN' | 'SELF_APPROVAL' };

export function checkTransition(
  from: CaseStatus,
  to: CaseStatus,
  permissions: readonly Permission[],
  opts: { actorId?: string; caseCreatorId?: string | null } = {},
): TransitionCheck {
  const t = CASE_TRANSITIONS[from].find((x) => x.to === to);
  if (!t) return { allowed: false, reason: 'INVALID_TRANSITION' };
  if (!t.anyOf.some((p) => permissions.includes(p))) return { allowed: false, reason: 'FORBIDDEN' };
  // A reviewer must not make a review decision on a case they created.
  const isReviewDecision = t.anyOf.length === 1 && t.anyOf[0] === 'cases.review';
  if (isReviewDecision && opts.actorId && opts.actorId === opts.caseCreatorId) {
    return { allowed: false, reason: 'SELF_APPROVAL' };
  }
  return { allowed: true };
}

/** Transitions the current user could perform right now. */
export function availableTransitions(
  from: CaseStatus,
  permissions: readonly Permission[],
  opts: { actorId?: string; caseCreatorId?: string | null } = {},
): CaseStatus[] {
  return CASE_TRANSITIONS[from]
    .map((t) => t.to)
    .filter((to) => checkTransition(from, to, permissions, opts).allowed);
}

export function isOpen(status: CaseStatus): boolean {
  return status !== 'CLOSED' && status !== 'RESOLVED';
}

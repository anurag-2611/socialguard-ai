import type { PermissionKey } from './permissions';

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

interface Transition {
  to: CaseStatus;
  /** Actor must hold at least one of these permissions. */
  anyOf: readonly PermissionKey[];
}

const ANALYST_STEP: readonly PermissionKey[] = ['cases.create'];
const REVIEW_STEP: readonly PermissionKey[] = ['cases.review'];

export const CASE_TRANSITIONS: Record<CaseStatus, readonly Transition[]> = {
  NEW: [
    { to: 'UNDER_REVIEW', anyOf: ['cases.create', 'cases.review'] },
    { to: 'FALSE_POSITIVE', anyOf: REVIEW_STEP },
    { to: 'CLOSED', anyOf: REVIEW_STEP },
  ],
  UNDER_REVIEW: [
    { to: 'EVIDENCE_REQUIRED', anyOf: REVIEW_STEP },
    { to: 'APPROVED_FOR_REPORTING', anyOf: REVIEW_STEP },
    { to: 'REJECTED', anyOf: REVIEW_STEP },
    { to: 'FALSE_POSITIVE', anyOf: REVIEW_STEP },
  ],
  EVIDENCE_REQUIRED: [{ to: 'UNDER_REVIEW', anyOf: ANALYST_STEP }],
  APPROVED_FOR_REPORTING: [
    { to: 'REPORT_SUBMITTED', anyOf: ANALYST_STEP },
    { to: 'UNDER_REVIEW', anyOf: REVIEW_STEP },
  ],
  REPORT_SUBMITTED: [
    { to: 'PLATFORM_REVIEW', anyOf: ANALYST_STEP },
    { to: 'RESOLVED', anyOf: ANALYST_STEP },
  ],
  PLATFORM_REVIEW: [
    { to: 'RESOLVED', anyOf: ANALYST_STEP },
    { to: 'CLOSED', anyOf: ANALYST_STEP },
  ],
  RESOLVED: [{ to: 'CLOSED', anyOf: REVIEW_STEP }],
  REJECTED: [
    { to: 'CLOSED', anyOf: REVIEW_STEP },
    { to: 'UNDER_REVIEW', anyOf: REVIEW_STEP },
  ],
  FALSE_POSITIVE: [{ to: 'CLOSED', anyOf: REVIEW_STEP }],
  CLOSED: [],
};

export type TransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: 'INVALID_TRANSITION' | 'FORBIDDEN' };

/** Pure function: structural validity first, then the actor's permissions. */
export function checkTransition(
  from: CaseStatus,
  to: CaseStatus,
  actorPermissions: readonly PermissionKey[],
): TransitionCheck {
  const transition = CASE_TRANSITIONS[from].find((t) => t.to === to);
  if (!transition) return { allowed: false, reason: 'INVALID_TRANSITION' };
  const permitted = transition.anyOf.some((p) => actorPermissions.includes(p));
  return permitted ? { allowed: true } : { allowed: false, reason: 'FORBIDDEN' };
}

/** Terminal states cannot be left; used by UI and retention logic. */
export function isTerminal(status: CaseStatus): boolean {
  return CASE_TRANSITIONS[status].length === 0;
}

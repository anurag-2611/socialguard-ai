import { CASE_STATUSES, CASE_TRANSITIONS, checkTransition, isTerminal } from './case-status';
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS, hasPermission } from './permissions';

describe('permissions matrix', () => {
  it('only references defined permissions', () => {
    for (const role of ROLES) {
      for (const p of ROLE_PERMISSIONS[role]) expect(Object.keys(PERMISSIONS)).toContain(p);
    }
  });

  it('read-only role has no write permissions', () => {
    expect(ROLE_PERMISSIONS.READ_ONLY.every((p) => p.endsWith('.view'))).toBe(true);
  });

  it('only reviewers can review; admins cannot approve cases', () => {
    expect(hasPermission('REVIEWER', 'cases.review')).toBe(true);
    expect(hasPermission('ANALYST', 'cases.review')).toBe(false);
    expect(hasPermission('SUPER_ADMIN', 'cases.review')).toBe(false);
  });

  it('only analysts can submit profiles for analysis', () => {
    expect(ROLES.filter((r) => hasPermission(r, 'profiles.analyze'))).toEqual(['ANALYST']);
  });
});

describe('case state machine', () => {
  const analyst = ROLE_PERMISSIONS.ANALYST;
  const reviewer = ROLE_PERMISSIONS.REVIEWER;

  it('covers every status', () => {
    expect(Object.keys(CASE_TRANSITIONS).sort()).toEqual([...CASE_STATUSES].sort());
  });

  it('rejects structurally invalid transitions regardless of role', () => {
    expect(checkTransition('NEW', 'RESOLVED', reviewer)).toEqual({
      allowed: false,
      reason: 'INVALID_TRANSITION',
    });
    expect(checkTransition('CLOSED', 'NEW', reviewer)).toEqual({
      allowed: false,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('forbids analysts from approving', () => {
    expect(checkTransition('UNDER_REVIEW', 'APPROVED_FOR_REPORTING', analyst)).toEqual({
      allowed: false,
      reason: 'FORBIDDEN',
    });
    expect(checkTransition('UNDER_REVIEW', 'APPROVED_FOR_REPORTING', reviewer)).toEqual({
      allowed: true,
    });
  });

  it('lets analysts resubmit after evidence was requested', () => {
    expect(checkTransition('EVIDENCE_REQUIRED', 'UNDER_REVIEW', analyst)).toEqual({
      allowed: true,
    });
  });

  it('gives read-only users no transitions', () => {
    for (const from of CASE_STATUSES) {
      for (const t of CASE_TRANSITIONS[from]) {
        expect(checkTransition(from, t.to, ROLE_PERMISSIONS.READ_ONLY).allowed).toBe(false);
      }
    }
  });

  it('has CLOSED as the only terminal state and every state can reach it', () => {
    expect(CASE_STATUSES.filter(isTerminal)).toEqual(['CLOSED']);
    const reachesClosed = (s: string, seen = new Set<string>()): boolean => {
      if (s === 'CLOSED') return true;
      if (seen.has(s)) return false;
      seen.add(s);
      return CASE_TRANSITIONS[s as (typeof CASE_STATUSES)[number]].some((t) =>
        reachesClosed(t.to, seen),
      );
    };
    for (const s of CASE_STATUSES) expect(reachesClosed(s)).toBe(true);
  });
});

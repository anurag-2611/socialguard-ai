import { availableTransitions, CASE_STATUSES, CASE_TRANSITIONS, checkTransition } from './caseStatus';
import { can, ROLE_PERMISSIONS } from './permissions';
import { buildProfile, EMPTY_FORM } from './profileForm';
import { levelFor, validateThresholds, DEFAULT_THRESHOLDS } from './risk';
import { parseProfileUrl } from './url';

describe('permissions', () => {
  it('only reviewers can review; admins and analysts cannot', () => {
    expect(can('REVIEWER', 'cases.review')).toBe(true);
    expect(can('ANALYST', 'cases.review')).toBe(false);
    expect(can('SUPER_ADMIN', 'cases.review')).toBe(false);
  });
  it('read-only users have only view permissions', () => {
    expect(ROLE_PERMISSIONS.READ_ONLY.every((p) => p.endsWith('.view'))).toBe(true);
  });
  it('signed-out users have no permissions', () => expect(can(undefined, 'cases.view')).toBe(false));
});

describe('case state machine', () => {
  const reviewer = ROLE_PERMISSIONS.REVIEWER;
  const analyst = ROLE_PERMISSIONS.ANALYST;
  it('covers every status and only CLOSED is terminal', () => {
    expect(Object.keys(CASE_TRANSITIONS).sort()).toEqual([...CASE_STATUSES].sort());
    expect(CASE_STATUSES.filter((s) => CASE_TRANSITIONS[s].length === 0)).toEqual(['CLOSED']);
  });
  it('rejects invalid transitions and unauthorised ones differently', () => {
    expect(checkTransition('NEW', 'RESOLVED', reviewer)).toEqual({ allowed: false, reason: 'INVALID_TRANSITION' });
    expect(checkTransition('UNDER_REVIEW', 'APPROVED_FOR_REPORTING', analyst)).toEqual({ allowed: false, reason: 'FORBIDDEN' });
    expect(checkTransition('UNDER_REVIEW', 'APPROVED_FOR_REPORTING', reviewer)).toEqual({ allowed: true });
  });
  it('blocks a review decision on a case the actor created', () => {
    const r = checkTransition('UNDER_REVIEW', 'REJECTED', reviewer, { actorId: 'u1', caseCreatorId: 'u1' });
    expect(r).toEqual({ allowed: false, reason: 'SELF_APPROVAL' });
    expect(checkTransition('UNDER_REVIEW', 'REJECTED', reviewer, { actorId: 'u2', caseCreatorId: 'u1' }).allowed).toBe(true);
  });
  it('offers read-only users no actions', () => {
    expect(availableTransitions('UNDER_REVIEW', ROLE_PERMISSIONS.READ_ONLY)).toEqual([]);
  });
});

describe('risk bands', () => {
  it('maps probability to levels at the configured edges', () => {
    expect(levelFor(0.29, DEFAULT_THRESHOLDS)).toBe('LOW');
    expect(levelFor(0.3, DEFAULT_THRESHOLDS)).toBe('MEDIUM');
    expect(levelFor(0.69, DEFAULT_THRESHOLDS)).toBe('MEDIUM');
    expect(levelFor(0.7, DEFAULT_THRESHOLDS)).toBe('HIGH');
  });
  it('respects changed thresholds', () => expect(levelFor(0.5, { low: 0.2, medium: 0.4 })).toBe('HIGH'));
  it('validates thresholds', () => {
    expect(validateThresholds({ low: 0.3, medium: 0.7 })).toBeNull();
    expect(validateThresholds({ low: 0.7, medium: 0.3 })).toMatch(/smaller/);
    expect(validateThresholds({ low: 0, medium: 0.5 })).toMatch(/between/);
    expect(validateThresholds({ low: NaN, medium: 0.5 })).toMatch(/numbers/);
  });
});

describe('profile URL allowlist', () => {
  it('accepts profile URLs on the right domain', () => {
    expect(parseProfileUrl('INSTAGRAM', 'https://www.instagram.com/mira.kowalski/')).toEqual({ ok: true, handle: 'mira.kowalski' });
    expect(parseProfileUrl('X', 'https://twitter.com/@someone')).toEqual({ ok: true, handle: 'someone' });
  });
  it('rejects other hosts, wrong platform, junk and non-profile paths', () => {
    expect(parseProfileUrl('INSTAGRAM', 'https://evil.example/user').ok).toBe(false);
    expect(parseProfileUrl('FACEBOOK', 'https://instagram.com/user').ok).toBe(false);
    expect(parseProfileUrl('X', 'not a url').ok).toBe(false);
    expect(parseProfileUrl('INSTAGRAM', 'https://instagram.com/p/abc').ok).toBe(false);
    expect(parseProfileUrl('INSTAGRAM', 'ftp://instagram.com/user').ok).toBe(false);
    expect(parseProfileUrl('INSTAGRAM', 'https://instagram.com/').ok).toBe(false);
  });
});

describe('profile form', () => {
  it('turns blank fields into null (UNAVAILABLE), never zero', () => {
    const r = buildProfile('mira', EMPTY_FORM);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.followers).toBeNull();
      expect(r.profile.account_age_days).toBeNull();
      expect(r.profile.bio).toBeNull();
      expect(r.profile.verified).toBeNull();
      expect(r.profile.username).toBe('mira');
    }
  });
  it('keeps real zeros and booleans', () => {
    const r = buildProfile('x', { ...EMPTY_FORM, followers: '0', hasProfileImage: 'false', verified: 'true' });
    expect(r.ok && r.profile.followers).toBe(0);
    expect(r.ok && r.profile.has_profile_image).toBe(false);
    expect(r.ok && r.profile.verified).toBe(true);
  });
  it('reports every invalid field', () => {
    const r = buildProfile('x', { ...EMPTY_FORM, followers: '-1', posts: '1.5', imageSimilarity: '2', accountAgeDays: 'abc', officialUsername: 'bad name' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['accountAgeDays', 'followers', 'imageSimilarity', 'officialUsername', 'posts']);
  });
});

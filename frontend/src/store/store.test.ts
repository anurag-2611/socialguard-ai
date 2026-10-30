import { vi } from 'vitest';
import type { PredictResponse } from '../lib/types';
import { MlError } from '../api/ml';

const predict = vi.fn();
vi.mock('../api/ml', async (orig) => {
  const actual = await orig<typeof import('../api/ml')>();
  return { ...actual, ml: { ...actual.ml, predict: (...a: unknown[]) => predict(...a) } };
});

import {
  addEvidence, addNote, changeStatus, DEMO_PASSWORD, generateReport, getState, login, logout,
  resetDemoData, resetStoreForTests, runAnalysis, setThresholds,
} from './store';

const response = (p: number): PredictResponse => ({
  request_id: 'r', risk_probability: p, model_name: 'logreg-baseline', model_version: 'v1', dataset_version: 'synthetic_v1',
  feature_schema_version: 'fs-1', intercept: -2,
  contributions: [{ feature: 'image_similarity', label: 'Image similarity', value: '0.91', available: true, contribution: 3.6, direction: 'increases_risk' }],
  unavailable_fields: ['verified'], signal_type: 'MODEL_SIGNAL', disclaimer: 'd',
});
const profile = { username: 'acmebank_official1', official_username: 'acmebank', account_age_days: 9, followers: 35, following: 1200, posts: 5, bio: null, has_profile_image: true, external_link_present: true, verified: null, image_similarity: 0.9, repeated_content_ratio: null };
const req = { platform: 'INSTAGRAM' as const, profileUrl: 'https://instagram.com/acmebank_official1', profile };
const as = (email: string) => { logout(); expect(login(email, DEMO_PASSWORD).ok).toBe(true); };

describe('demo store workflow', () => {
  beforeEach(() => { resetStoreForTests(); predict.mockReset(); });

  it('rejects wrong credentials and logs the failure', () => {
    expect(login('analyst@socialguard.demo', 'nope')).toEqual({ ok: false, error: 'Invalid email or password.' });
    expect(getState().sessionUserId).toBeNull();
    expect(getState().audit.at(-1)?.action).toBe('LOGIN_FAILED');
  });

  it('blocks analysis for roles without permission and when signed out', async () => {
    expect((await runAnalysis(req)).ok).toBe(false);
    as('reviewer@socialguard.demo');
    expect(await runAnalysis(req)).toEqual({ ok: false, error: 'Your role does not have permission for this action.' });
    expect(predict).not.toHaveBeenCalled();
  });

  it('auto-creates a numbered case with hashed evidence for HIGH risk', async () => {
    predict.mockResolvedValue(response(0.95));
    as('analyst@socialguard.demo');
    const out = await runAnalysis(req);
    expect(out.ok && out.analysis.riskLevel).toBe('HIGH');
    expect(out.ok && out.caseNumber).toMatch(/^CASE-\d{4}-000001$/);
    const c = getState().cases[0]!;
    expect(c.status).toBe('NEW');
    expect(c.evidence).toHaveLength(2);
    expect(c.evidence.every((e) => /^[0-9a-f]{64}$/.test(e.sha256))).toBe(true);
  });

  it('does not create a case for LOW risk, and stores the thresholds used', async () => {
    predict.mockResolvedValue(response(0.1));
    as('analyst@socialguard.demo');
    const out = await runAnalysis(req);
    expect(out.ok && out.caseNumber).toBeNull();
    expect(getState().cases).toHaveLength(0);
    expect(getState().analyses[0]?.thresholdsSnapshot).toEqual({ low: 0.3, medium: 0.7 });
  });

  it('propagates ML service errors without saving anything', async () => {
    predict.mockRejectedValue(new MlError('offline', 'OFFLINE'));
    as('analyst@socialguard.demo');
    await expect(runAnalysis(req)).rejects.toThrow('offline');
    expect(getState().analyses).toHaveLength(0);
  });

  it('enforces the review workflow by role', async () => {
    predict.mockResolvedValue(response(0.95));
    as('analyst@socialguard.demo');
    await runAnalysis(req);
    const id = getState().cases[0]!.id;
    expect(changeStatus(id, 'UNDER_REVIEW', '').ok).toBe(true);
    expect(changeStatus(id, 'APPROVED_FOR_REPORTING', '').ok).toBe(false); // analyst cannot approve
    as('reviewer@socialguard.demo');
    expect(changeStatus(id, 'RESOLVED', '').ok).toBe(false); // invalid transition
    expect(changeStatus(id, 'APPROVED_FOR_REPORTING', '').ok).toBe(true);
    expect(getState().cases[0]?.assignedReviewerId).toBe('u-reviewer');
    expect(getState().cases[0]?.history.map((h) => h.to)).toEqual(['NEW', 'UNDER_REVIEW', 'APPROVED_FOR_REPORTING']);
    as('readonly@socialguard.demo');
    expect(changeStatus(id, 'UNDER_REVIEW', '').ok).toBe(false);
    expect(getState().audit.some((a) => a.action === 'STATUS_CHANGE_DENIED')).toBe(true);
  });

  it('adds notes and evidence only with permission and valid text', async () => {
    predict.mockResolvedValue(response(0.95));
    as('analyst@socialguard.demo');
    await runAnalysis(req);
    const id = getState().cases[0]!.id;
    expect(addNote(id, '   ').ok).toBe(false);
    expect(addNote(id, 'checked the official site').ok).toBe(true);
    expect((await addEvidence(id, 'Official site lists a different handle')).ok).toBe(true);
    expect(getState().cases[0]?.evidence).toHaveLength(3);
    as('readonly@socialguard.demo');
    expect(addNote(id, 'x').ok).toBe(false);
  });

  it('generates a hashed report snapshot', async () => {
    predict.mockResolvedValue(response(0.95));
    as('analyst@socialguard.demo');
    await runAnalysis(req);
    const out = await generateReport(getState().cases[0]!.id);
    expect(out.ok && out.report.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.ok && out.report.snapshot.indicators[0]?.label).toBe('Image similarity');
    expect(out.ok && out.report.snapshot.riskLevel).toBe('HIGH');
  });

  it('lets only the admin change thresholds, validated, and reset demo data', async () => {
    as('analyst@socialguard.demo');
    expect(setThresholds({ low: 0.2, medium: 0.5 }).ok).toBe(false);
    as('admin@socialguard.demo');
    expect(setThresholds({ low: 0.6, medium: 0.4 }).ok).toBe(false);
    expect(setThresholds({ low: 0.2, medium: 0.5 }).ok).toBe(true);
    expect(getState().thresholds).toEqual({ low: 0.2, medium: 0.5 });
    expect(resetDemoData().ok).toBe(true);
    expect(getState().analyses).toHaveLength(0);
    expect(getState().sessionUserId).toBe('u-admin');
  });
});

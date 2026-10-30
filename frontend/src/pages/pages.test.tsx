import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from '../App';
import type { PredictResponse } from '../lib/types';

const predict = vi.fn();
const health = vi.fn();
vi.mock('../api/ml', async (orig) => {
  const actual = await orig<typeof import('../api/ml')>();
  return { ...actual, ml: { ...actual.ml, predict: (...a: unknown[]) => predict(...a), health: () => health(), modelInfo: vi.fn() } };
});

import { DEMO_PASSWORD, login, logout, resetStoreForTests } from '../store/store';

const high: PredictResponse = {
  request_id: 'r', risk_probability: 0.93, model_name: 'logreg-baseline', model_version: 'v1', dataset_version: 'synthetic_v1',
  feature_schema_version: 'fs-1', intercept: -2,
  contributions: [{ feature: 'image_similarity', label: 'Profile image similarity to official image', value: '0.91', available: true, contribution: 3.6, direction: 'increases_risk' }],
  unavailable_fields: ['verified'], signal_type: 'MODEL_SIGNAL', disclaimer: 'd',
};

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('pages', () => {
  beforeEach(() => { resetStoreForTests(); predict.mockReset(); health.mockResolvedValue({ status: 'ok', model_loaded: true, version: '0.2.0' }); });

  it('validates the sign-in form and rejects bad credentials', () => {
    renderAt('/login');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'analyst@socialguard.demo' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('signs in and shows an honest empty dashboard (no fake statistics)', async () => {
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'analyst@socialguard.demo' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: DEMO_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('No profiles analyzed yet')).toBeInTheDocument();
    expect(screen.getByText(/Demo mode/)).toBeInTheDocument();
  });

  it('hides navigation the role may not use and blocks direct access', () => {
    login('readonly@socialguard.demo', DEMO_PASSWORD);
    renderAt('/analyze');
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Analyze profile' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Administration' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Cases' })).toBeInTheDocument();
  });

  it('rejects a profile URL on the wrong domain before calling the ML service', async () => {
    login('analyst@socialguard.demo', DEMO_PASSWORD);
    renderAt('/analyze');
    fireEvent.change(screen.getByLabelText('Profile URL'), { target: { value: 'https://evil.example/user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze profile' }));
    expect(await screen.findByText(/URL must be on instagram.com/)).toBeInTheDocument();
    expect(predict).not.toHaveBeenCalled();
  });

  it('analyzes a profile, shows the score and reasons, and opens a case for HIGH risk', async () => {
    predict.mockResolvedValue(high);
    login('analyst@socialguard.demo', DEMO_PASSWORD);
    renderAt('/analyze');
    fireEvent.click(screen.getByRole('button', { name: 'Suspicious-looking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze profile' }));
    expect(await screen.findByText('Profile image similarity to official image')).toBeInTheDocument();
    expect(screen.getAllByText('93.0%').length).toBeGreaterThan(0);
    expect(screen.getByText(/MODEL SIGNAL, not proven fact/)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable inputs:/).closest('p')).toHaveTextContent('verified');
    expect(await screen.findByText(/was created automatically/)).toBeInTheDocument();
    expect(predict).toHaveBeenCalledOnce();
    // blank form fields were sent as null, not zero
    const sent = predict.mock.calls[0]?.[0] as { verified: unknown; followers: number };
    expect(sent.verified).toBeNull();
    expect(sent.followers).toBe(35);
  });

  it('shows a helpful message when the ML service is offline', async () => {
    const { MlError } = await import('../api/ml');
    predict.mockRejectedValue(new MlError('Cannot reach the ML service at http://localhost:8000. Is it running?', 'OFFLINE'));
    login('analyst@socialguard.demo', DEMO_PASSWORD);
    renderAt('/analyze');
    fireEvent.click(screen.getByRole('button', { name: 'Genuine-looking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze profile' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Cannot reach the ML service/));
    expect(screen.getByRole('alert')).toHaveTextContent(/uvicorn/);
  });

  it('lets a reviewer approve a case while the analyst has no review buttons', async () => {
    predict.mockResolvedValue(high);
    login('analyst@socialguard.demo', DEMO_PASSWORD);
    const first = renderAt('/analyze');
    fireEvent.click(screen.getByRole('button', { name: 'Suspicious-looking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze profile' }));
    const link = await screen.findByRole('link', { name: /CASE-\d{4}-000001/ });
    const href = link.getAttribute('href') ?? '/cases';
    first.unmount();

    const asAnalyst = renderAt(href);
    fireEvent.click(await screen.findByRole('button', { name: 'Under review' }));
    expect(await screen.findByText(/Status changed to Under review/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approved for reporting' })).toBeNull();
    asAnalyst.unmount();

    logout();
    login('reviewer@socialguard.demo', DEMO_PASSWORD);
    renderAt(href);
    fireEvent.click(await screen.findByRole('button', { name: 'Approved for reporting' }));
    expect(await screen.findByText(/Status changed to Approved for reporting/)).toBeInTheDocument();
  });
});

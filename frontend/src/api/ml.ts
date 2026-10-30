import type { ModelInfo, PredictResponse, ProfileInput } from '../lib/types';

const BASE = (import.meta.env.VITE_ML_URL as string | undefined) ?? 'http://localhost:8000';

export class MlError extends Error {
  constructor(
    message: string,
    readonly kind: 'OFFLINE' | 'NO_MODEL' | 'INVALID' | 'ERROR',
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new MlError(`Cannot reach the ML service at ${BASE}. Is it running?`, 'OFFLINE');
  }
  if (response.status === 503) throw new MlError('The ML service is running but no model is loaded.', 'NO_MODEL');
  if (response.status === 422) throw new MlError('The ML service rejected the profile data.', 'INVALID');
  if (!response.ok) throw new MlError(`ML service error (${response.status}).`, 'ERROR');
  return (await response.json()) as T;
}

export interface MlHealth {
  status: string;
  model_loaded: boolean;
  version: string;
}

export const ml = {
  baseUrl: BASE,
  health: () => call<MlHealth>('/health'),
  modelInfo: () => call<ModelInfo>('/model/info'),
  predict: (profile: ProfileInput, requestId: string) =>
    call<PredictResponse>('/predict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, profile }),
    }),
};

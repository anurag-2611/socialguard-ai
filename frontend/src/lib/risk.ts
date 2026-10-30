export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** LOW: p < low;  MEDIUM: low <= p < medium;  HIGH: p >= medium.  Prototype defaults. */
export interface Thresholds {
  low: number;
  medium: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { low: 0.3, medium: 0.7 };

export function levelFor(probability: number, t: Thresholds): RiskLevel {
  if (probability >= t.medium) return 'HIGH';
  if (probability >= t.low) return 'MEDIUM';
  return 'LOW';
}

export function validateThresholds(t: Thresholds): string | null {
  if (!Number.isFinite(t.low) || !Number.isFinite(t.medium)) return 'Both thresholds must be numbers.';
  if (t.low <= 0 || t.medium >= 1) return 'Thresholds must be between 0 and 1 (exclusive).';
  if (t.low >= t.medium) return 'The LOW threshold must be smaller than the MEDIUM threshold.';
  return null;
}

export const LEVEL_ORDER: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

import type { CaseStatus } from './caseStatus';
import type { Role } from './permissions';
import type { RiskLevel, Thresholds } from './risk';

export type Platform = 'INSTAGRAM' | 'FACEBOOK' | 'X';
export const PLATFORMS: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'X'];
export const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  X: 'X',
};

/** Raw public profile data. null = UNAVAILABLE (never invented). Matches the ML service schema. */
export interface ProfileInput {
  username: string;
  official_username: string | null;
  account_age_days: number | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  bio: string | null;
  has_profile_image: boolean | null;
  external_link_present: boolean | null;
  verified: boolean | null;
  image_similarity: number | null;
  repeated_content_ratio: number | null;
}

export interface Contribution {
  feature: string;
  label: string;
  value: string;
  available: boolean;
  contribution: number;
  direction: 'increases_risk' | 'decreases_risk';
}

export interface PredictResponse {
  request_id: string | null;
  risk_probability: number;
  model_name: string;
  model_version: string;
  dataset_version: string;
  feature_schema_version: string;
  intercept: number;
  contributions: Contribution[];
  unavailable_fields: string[];
  signal_type: 'MODEL_SIGNAL';
  disclaimer: string;
}

export interface ModelInfo {
  model_name: string;
  model_version: string;
  dataset_version: string;
  dataset_kind: string;
  feature_schema_version: string;
  class_weight: string | null;
  trained_at: string;
  test_metrics: Record<string, number>;
  caveat: string;
}

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Analysis {
  id: string;
  platform: Platform;
  profileUrl: string;
  profile: ProfileInput;
  result: PredictResponse;
  riskLevel: RiskLevel;
  thresholdsSnapshot: Thresholds;
  analystId: string;
  createdAt: string;
  caseId: string | null;
}

export interface Evidence {
  id: string;
  type: 'PROFILE_METADATA' | 'MODEL_OUTPUT' | 'ANALYST_OBSERVATION';
  source: string;
  description: string;
  sha256: string;
  capturedAt: string;
  createdById: string;
}

export interface CaseNote {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  from: CaseStatus | null;
  to: CaseStatus;
  byId: string;
  reason: string;
  at: string;
}

export interface CaseRecord {
  id: string;
  caseNumber: string;
  analysisId: string;
  status: CaseStatus;
  priority: 'NORMAL' | 'HIGH';
  createdById: string;
  assignedAnalystId: string;
  assignedReviewerId: string | null;
  evidence: Evidence[];
  notes: CaseNote[];
  history: HistoryEntry[];
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportRecord {
  id: string;
  caseId: string;
  caseNumber: string;
  generatedAt: string;
  generatedById: string;
  provider: 'manual-export';
  sha256: string;
  snapshot: {
    platform: Platform;
    profileUrl: string;
    detectionTime: string;
    riskProbability: number;
    riskLevel: RiskLevel;
    modelName: string;
    modelVersion: string;
    datasetVersion: string;
    indicators: { label: string; value: string; contribution: number }[];
    unavailable: string[];
    evidence: { type: string; source: string; capturedAt: string; sha256: string; description: string }[];
    status: CaseStatus;
    reviewer: string | null;
  };
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  action: string;
  entity: string;
  detail: string;
}

export const ROLES = ['SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'READ_ONLY'] as const;
export type RoleName = (typeof ROLES)[number];

/** Single source of truth for permissions. Code checks permission keys, never role names. */
export const PERMISSIONS = {
  'users.manage': 'Create, update and deactivate users',
  'roles.manage': 'Assign roles to users',
  'config.manage': 'Change risk thresholds, retention and other system settings',
  'models.manage': 'Activate or retire model versions',
  'audit.view': 'View audit logs',
  'analytics.view': 'View dashboards and aggregate analytics',
  'profiles.analyze': 'Submit profiles for analysis',
  'cases.create': 'Create cases and progress analyst-owned transitions',
  'cases.view': 'View cases and detection results',
  'cases.notes.add': 'Add investigation notes',
  'cases.review': 'Approve, reject or mark cases as false positive',
  'cases.evidence.add': 'Attach evidence to cases',
  'reports.generate': 'Generate and export reports',
  'reports.view': 'View generated reports',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  SUPER_ADMIN: 'Manages users, roles, system settings, models and audit logs',
  ANALYST: 'Submits profiles, investigates cases, builds evidence and reports',
  REVIEWER: 'Reviews analyst cases and makes approval decisions',
  READ_ONLY: 'Views permitted dashboards and cases; cannot modify anything',
};

export const ROLE_PERMISSIONS: Record<RoleName, readonly PermissionKey[]> = {
  SUPER_ADMIN: [
    'users.manage',
    'roles.manage',
    'config.manage',
    'models.manage',
    'audit.view',
    'analytics.view',
    'cases.view',
    'reports.view',
  ],
  ANALYST: [
    'analytics.view',
    'profiles.analyze',
    'cases.create',
    'cases.view',
    'cases.notes.add',
    'cases.evidence.add',
    'reports.generate',
    'reports.view',
  ],
  REVIEWER: [
    'analytics.view',
    'cases.view',
    'cases.notes.add',
    'cases.review',
    'cases.evidence.add',
    'reports.generate',
    'reports.view',
  ],
  READ_ONLY: ['analytics.view', 'cases.view', 'reports.view'],
};

export function hasPermission(role: RoleName, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

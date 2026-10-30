export const ROLES = ['SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'READ_ONLY'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ANALYST: 'Analyst',
  REVIEWER: 'Reviewer',
  READ_ONLY: 'Read-only',
};

/** Mirrors backend/src/domain/permissions.ts. The backend will be the source of truth. */
export const PERMISSIONS = {
  'users.manage': 'Manage users',
  'roles.manage': 'Manage roles',
  'config.manage': 'Change risk thresholds and settings',
  'models.manage': 'Manage model versions',
  'audit.view': 'View audit logs',
  'analytics.view': 'View dashboard',
  'profiles.analyze': 'Submit profiles for analysis',
  'cases.create': 'Create cases and progress analyst steps',
  'cases.view': 'View cases',
  'cases.notes.add': 'Add investigation notes',
  'cases.review': 'Approve, reject or mark false positive',
  'cases.evidence.add': 'Attach evidence',
  'reports.generate': 'Generate reports',
  'reports.view': 'View reports',
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
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

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

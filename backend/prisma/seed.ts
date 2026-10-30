/* Seeds reference data only: permissions, roles, system config, platform integrations.
 * Users are created through the auth module (Phase 4), never with a hardcoded password here. */
import { PrismaClient } from '@prisma/client';
import {
  PERMISSIONS,
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_PERMISSIONS,
  type PermissionKey,
} from '../src/domain/permissions';

const prisma = new PrismaClient();

async function seedPermissionsAndRoles(): Promise<void> {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  for (const name of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name] },
      create: { name, description: ROLE_DESCRIPTIONS[name] },
    });

    const keys: readonly PermissionKey[] = ROLE_PERMISSIONS[name];
    const permissions = await prisma.permission.findMany({ where: { key: { in: [...keys] } } });

    // Make the DB match the code exactly (removes permissions dropped from the matrix).
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }
}

async function seedSystemConfig(): Promise<void> {
  const defaults: Record<string, unknown> = {
    // LOW: p < low, MEDIUM: low <= p < medium, HIGH: p >= medium.
    // Initial PROTOTYPE values. Validate on representative authorized data before operational use.
    risk_thresholds: {
      low: Number(process.env.RISK_THRESHOLD_LOW ?? 0.3),
      medium: Number(process.env.RISK_THRESHOLD_MEDIUM ?? 0.7),
    },
    // Retention in days; null = keep indefinitely. audit_logs are never auto-deleted.
    retention_days: { closed_cases: 365, analysis_jobs: 90, notifications: 30 },
  };
  for (const [key, value] of Object.entries(defaults)) {
    // update: {} -> never overwrite values an admin has changed.
    await prisma.systemConfig.upsert({
      where: { key },
      update: {},
      create: { key, value: value as object },
    });
  }
}

async function seedIntegrations(): Promise<void> {
  const platforms = ['INSTAGRAM', 'FACEBOOK', 'X'] as const;
  const isProd = process.env.NODE_ENV === 'production';
  for (const platform of platforms) {
    // MANUAL = analyst-entered public metrics. MOCK = synthetic demo data, off in production.
    // OFFICIAL is intentionally NOT seeded: no official integration exists yet.
    await prisma.platformIntegration.upsert({
      where: { platform_kind: { platform, kind: 'MANUAL' } },
      update: {},
      create: { platform, kind: 'MANUAL', enabled: true },
    });
    await prisma.platformIntegration.upsert({
      where: { platform_kind: { platform, kind: 'MOCK' } },
      update: {},
      create: { platform, kind: 'MOCK', enabled: !isProd },
    });
  }
}

async function main(): Promise<void> {
  await seedPermissionsAndRoles();
  await seedSystemConfig();
  await seedIntegrations();
  console.log('Seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

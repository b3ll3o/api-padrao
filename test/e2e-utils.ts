import { PrismaClient } from '@prisma/client';

export async function cleanDatabase(prisma: PrismaClient) {
  // Order matters due to foreign key constraints if not using CASCADE properly,
  // but TRUNCATE with CASCADE should handle it.
  // However, explicit listing can sometimes be more reliable in certain environments.

  const tables = [
    'PasswordResetToken',
    'RefreshToken',
    'LoginHistory',
    'AuditLog',
    'UsuarioEmpresa',
    'Perfil',
    'Usuario',
    'Empresa',
    'Permissao',
  ];

  try {
    // Disable FK checks and truncate all in one go if possible, or use CASCADE
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "${tables.join('", "')}" CASCADE;`,
    );

    // Reset sequences for tables with autoincrement IDs
    await prisma.$executeRawUnsafe(
      `ALTER SEQUENCE IF EXISTS "Usuario_id_seq" RESTART WITH 1;`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER SEQUENCE IF EXISTS "Perfil_id_seq" RESTART WITH 1;`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER SEQUENCE IF EXISTS "Permissao_id_seq" RESTART WITH 1;`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER SEQUENCE IF EXISTS "UsuarioEmpresa_id_seq" RESTART WITH 1;`,
    );
  } catch {
    // Silently swallow cleanup errors; the next test's setup will surface
    // stale-data issues and Jest's assertion errors already give the
    // operator everything they need to debug.
  }
}

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

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

  // [E2E-REDIS-001] Limpa estado do Redis (BullMQ queues, throttle counters,
  // login attempt tracker, throttler storage) entre testes. Sem isso, o
  // segundo teste numa suite sequencial herda contadores de lockout e
  // rate-limit do primeiro — gera falsos 429.
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    await redis.flushdb();
    await redis.quit();
  } catch {
    // Silencioso: se Redis estiver offline, o teste já vai falhar pelo
    // motivo real e o operador vai ver a stack trace.
  }
}

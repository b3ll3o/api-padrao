import { PrismaClient } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { TestDataBuilder } from './test-data-builder';

export async function cleanDatabase(prisma: PrismaClient) {
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"${name}"`)
    .join(', ');

  try {
    if (tables) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    }
  } catch (error) {
    console.error({ error });
  }
}

export async function setupE2ETestData(app: INestApplication) {
  const testDataBuilder = new TestDataBuilder(app);

  const { token: adminToken } = await testDataBuilder.createAdminUserAndToken();
  const { token: userToken } =
    await testDataBuilder.createLimitedUserAndToken();

  return { adminToken, userToken };
}

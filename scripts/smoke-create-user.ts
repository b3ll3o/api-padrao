import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();
async function main(): Promise<void> {
  const hashed = await hash('Test@1234', 10);
  const u = await prisma.usuario.upsert({
    where: { email: 'smoke@local' },
    update: { senha: hashed },
    create: { email: 'smoke@local', senha: hashed },
  });
  console.log('User:', u.id, u.email);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

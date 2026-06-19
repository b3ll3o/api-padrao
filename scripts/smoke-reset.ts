import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();
async function main(): Promise<void> {
  const hashed = await hash('Test@1234', 10);
  // Delete old test user
  await prisma.usuario.deleteMany({ where: { email: { in: ['smoke@local', 'smoke@example.com'] } } });
  const u = await prisma.usuario.create({
    data: { email: 'smoke@example.com', senha: hashed, ativo: true },
  });
  console.log('User created:', u.id, u.email);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

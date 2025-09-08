import { execSync } from 'child_process';

export default async () => {
  console.log('\nSetting up e2e tests...');
  try {
    // Reset and migrate the test database
    execSync('PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="sim" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/api-padrao-test" npx prisma migrate reset --force --skip-generate', { stdio: 'inherit' });
    console.log('e2e test setup complete.');
  } catch (error) {
    console.error('e2e test setup failed:', error);
    process.exit(1);
  }
};

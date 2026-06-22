-- [H3] Tabela `login_attempts` — fallback Prisma para o
-- `LoginAttemptTracker` (account lockout via Redis).
--
-- Quando o Redis está offline, o adapter `CacheLoginAttemptTracker`
-- grava nesta tabela via `prisma.loginAttempt.create` para garantir que
-- o lockout continua funcionando (sem fail-open). O check de lock
-- também cai aqui contando `success = false` na janela de 15 minutos.
--
-- Os índices suportam as duas queries principais:
-- - `email + attemptedAt`: lockout por conta (mesmo email).
-- - `ip + attemptedAt`: defesa adicional por IP (futuro, brute-force
--   distribuído entre vários emails).
CREATE TABLE "login_attempts" (
  "id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "ip" VARCHAR(45),
  "userAgent" VARCHAR(500),
  "success" BOOLEAN NOT NULL DEFAULT false,
  "failureReason" VARCHAR(50),
  "attemptedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- Lockout por email dentro da janela.
CREATE INDEX "login_attempts_email_attemptedAt_idx"
  ON "login_attempts"("email", "attemptedAt");

-- Lockout por IP (defesa contra brute-force distribuído entre emails).
CREATE INDEX "login_attempts_ip_attemptedAt_idx"
  ON "login_attempts"("ip", "attemptedAt");

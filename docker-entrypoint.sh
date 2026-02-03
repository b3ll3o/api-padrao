#!/bin/sh
set -e

# Rodar migrations se necessário (apenas em produção ou se desejado)
if [ "$NODE_ENV" = "production" ]; then
  echo "Running database migrations..."
  npx prisma migrate deploy
fi

# Iniciar a aplicação
echo "Starting application..."
exec "$@"

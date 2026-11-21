#!/usr/bin/env bash
# Galaxy Cinema - deploy helper cho CI/CD (chạy trên server)
#
# Tải code mới nhất từ Git, build image, restart container.
# Script này được thiết lập để GitHub Actions gọi qua SSH, nhưng cũng
# chạy tay được:  ./deploy.sh
#
# Yêu cầu trên server:
#   - docker, docker compose v2, git
#   - file .env ở thư mục gốc project (xem .env.deploy.example)
#   - đăng nhập GHCR trước:  echo $TOKEN | docker login ghcr.io -u <user> --password-stdin
set -euo pipefail

cd "$(dirname "$0")"
BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE_FILE="docker-compose.deploy.yml"

echo "==> Galaxy Cinema deploy (branch: $BRANCH)"

# --- 1. Lấy code mới ---
if [ -d .git ]; then
  echo ">> Pulling latest changes..."
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  echo "!! Không phải git repo — bỏ qua bước pull code."
fi

# --- 2. Backup .env ---
if [ -f .env ]; then
  BACKUP=".env.bak.$(date +%Y%m%d%H%M%S)"
  cp .env "$BACKUP"
  echo ">> Backed up .env -> $BACKUP"
fi

# --- 3. Build image ---
echo ">> Building docker images..."
docker compose -f "$COMPOSE_FILE" build --pull
docker compose -f "$COMPOSE_FILE" pull db || true

# --- 4. Restart ---
echo ">> Restarting services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose -f "$COMPOSE_FILE" ps

# --- 5. Health check ---
echo ">> Health check..."
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
OK=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" > /dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 10
done

if [ "$OK" -ne 1 ]; then
  echo "!! Backend không healthy. Log gần đây:"
  docker compose -f "$COMPOSE_FILE" logs --tail=100 backend
  exit 1
fi

echo ">> Backend OK:  http://127.0.0.1:${BACKEND_PORT}/api/health"
echo ">> Frontend:    http://127.0.0.1:${FRONTEND_PORT}"
echo "==> Deploy thành công."

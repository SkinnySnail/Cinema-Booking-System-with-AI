#!/usr/bin/env bash
# Galaxy Cinema - local dev stack helper (Linux / macOS)
# Usage:
#   ./run-dev.sh start     # start db + app + frontend + ai
#   ./run-dev.sh stop      # stop everything (keeps DB volume)
#   ./run-dev.sh reset     # stop + delete DB volume (wipes all data)
#   ./run-dev.sh status    # show service status
#   ./run-dev.sh logs ai   # tail logs for one service
set -euo pipefail

cd "$(dirname "$0")"
PROJECT=galaxy-cinema-local
COMPOSE="docker compose -p $PROJECT -f docker.yml -f docker-compose.ai.yml --profile ai"

# AI_SERVICE_KEY must be identical for the backend and the AI container.
# Read it from .env; generate one only when it is missing or empty.
KEY=$(awk -F= '/^AI_SERVICE_KEY=/{print $2}' .env 2>/dev/null | head -1)
if [ -z "$KEY" ]; then
  KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || head -c 64 /dev/urandom | xxd -p -c 64)
  if grep -q '^AI_SERVICE_KEY=' .env 2>/dev/null; then
    sed -i "s|^AI_SERVICE_KEY=.*|AI_SERVICE_KEY=$KEY|" .env
  else
    printf '\nAI_SERVICE_KEY=%s\n' "$KEY" >> .env
  fi
  echo "Generated a new AI_SERVICE_KEY."
fi
export AI_SERVICE_KEY="$KEY"

case "${1:-start}" in
  start)
    # Sinh ảnh poster phim + ảnh bắp nước (gradient + typography, tránh bản quyền).
    # uploads/ bị .gitignore nên phải sinh lại sau mỗi lần clone/reset.
    if command -v python3 >/dev/null 2>&1; then
      python3 backend/database/generate_posters.py >/dev/null 2>&1 || \
        echo "  [warn] Khong sinh được poster (thu muc backend/uploads/posters/ co thể bi khoa)"
      python3 backend/database/generate_concession_images.py >/dev/null 2>&1 || \
        echo "  [warn] Khong sinh được anh bap nuoc (thu muc backend/uploads/concessions/ co the bi khoa)"
    fi
    # --force-recreate để app/ai luôn nhận đúng AI_SERVICE_KEY hiện tại.
    # Nếu không, container cũ giữ key cũ và AI chat trả "chưa kết nối được".
    $COMPOSE up -d --force-recreate app ai
    $COMPOSE up -d db frontend
    echo
    echo "  Frontend  http://localhost:8080"
    echo "  API       http://localhost:8000/api/health"
    echo "  DB        localhost:3307  (root / 123456, db=galaxy_cinema)"
    ;;
  stop)
    $COMPOSE stop
    ;;
  reset)
    $COMPOSE down -v
    echo "Volumes removed. Next start will re-run:"
    echo "  01_schema.sql                      -> tao 37 bang"
    echo "  02_seed_data.sql                   -> du lieu mau (6 user, 6 phim, 3 rap)"
    echo "  03_auto_seed_current_showtimes.sql -> sinh lich chieu tu hom nay"
    ;;
  status)
    $COMPOSE ps
    ;;
  logs)
    $COMPOSE logs -f "${2:-ai}"
    ;;
  *)
    echo "Usage: $0 {start|stop|reset|status|logs [service]}"
    exit 1
    ;;
esac

#!/usr/bin/env bash
# Apply SQL migrations exactly once, tracked in the `schema_migrations` table.
#
# Usage (from the project root):
#   scripts/run_migrations.sh                       # server: docker-compose.deploy.yml
#   scripts/run_migrations.sh docker.yml            # local Docker stack
#   DRY_RUN=1 scripts/run_migrations.sh docker.yml  # only list what would run
#
# - Only backend/database/migrations/*.sql are considered, in filename order.
#   Name new files so they sort after existing ones, e.g. 2026_11_24_add_x.sql.
# - First run (empty tracking table): files listed in migrations/.baseline are
#   recorded as already applied WITHOUT executing them (schema.sql contains them,
#   and several are not safe to re-run). Everything else runs once.
# - A failing migration stops the script with a non-zero exit code and is not
#   recorded, so the next run retries it. Edited, already-applied files only
#   produce a warning; write a new migration instead of editing an old one.
# - The MySQL root password is read inside the db container ($MYSQL_ROOT_PASSWORD).
set -euo pipefail

COMPOSE_FILE="${1:-${COMPOSE_FILE:-docker-compose.deploy.yml}}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-backend/database/migrations}"
DB_SERVICE="${DB_SERVICE:-db}"
DRY_RUN="${DRY_RUN:-0}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

# Run SQL read from stdin inside the db container.
mysql_stdin() {
  docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" sh -c \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N -B --default-character-set=utf8mb4 "${MYSQL_DATABASE:-galaxy_cinema}"'
}

query() {
  printf '%s\n' "$1" | mysql_stdin
}

valid_name() {
  [[ "$1" =~ ^[A-Za-z0-9_.-]+\.sql$ ]]
}

checksum() {
  sha256sum "$1" | cut -d' ' -f1
}

query "CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) NOT NULL PRIMARY KEY,
  checksum CHAR(64) NULL,
  baseline TINYINT(1) NOT NULL DEFAULT 0,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"

tracked="$(query 'SELECT COUNT(*) FROM schema_migrations;')"
dry_baseline=""
if [ "$tracked" = "0" ] && [ -f "$MIGRATIONS_DIR/.baseline" ]; then
  echo ">> First run: recording baseline migrations as already applied"
  values=""
  while IFS= read -r name; do
    name="${name%$'\r'}"
    case "$name" in ''|'#'*) continue ;; esac
    if ! valid_name "$name"; then
      echo "Invalid name in .baseline: $name" >&2
      exit 1
    fi
    sum="NULL"
    [ -f "$MIGRATIONS_DIR/$name" ] && sum="'$(checksum "$MIGRATIONS_DIR/$name")'"
    values="${values:+$values,}('$name',$sum,1)"
    dry_baseline="${dry_baseline}${name}"$'\t\t1\n'
  done < "$MIGRATIONS_DIR/.baseline"
  if [ -n "$values" ] && [ "$DRY_RUN" != "1" ]; then
    query "INSERT IGNORE INTO schema_migrations (filename, checksum, baseline) VALUES $values;"
  fi
  echo "   $(printf '%s' "$values" | grep -o "'[^']*\.sql'" | wc -l) file(s) marked as baseline"
fi

applied="$(query 'SELECT filename, IFNULL(checksum, ""), baseline FROM schema_migrations;')"
if [ "$DRY_RUN" = "1" ] && [ -n "$dry_baseline" ]; then
  # Dry run does not write the baseline rows; treat them as applied anyway.
  applied="${applied}"$'\n'"${dry_baseline}"
fi

ran=0
while IFS= read -r path; do
  name="$(basename "$path")"
  if ! valid_name "$name"; then
    echo "Skipping file with unsupported name: $name" >&2
    continue
  fi
  row="$(printf '%s\n' "$applied" | awk -F'\t' -v n="$name" '$1 == n')"
  if [ -n "$row" ]; then
    old_sum="$(printf '%s' "$row" | cut -f2)"
    is_baseline="$(printf '%s' "$row" | cut -f3)"
    if [ "$is_baseline" != "1" ] && [ -n "$old_sum" ] && [ "$old_sum" != "$(checksum "$path")" ]; then
      echo "WARNING: $name changed after it was applied; it will not run again." >&2
    fi
    continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "-- would apply: $name"
    ran=$((ran + 1))
    continue
  fi

  echo ">> Applying $name"
  if ! mysql_stdin < "$path"; then
    echo "Migration failed: $name (not recorded; fix it and re-run)" >&2
    exit 1
  fi
  query "INSERT INTO schema_migrations (filename, checksum) VALUES ('$name', '$(checksum "$path")');"
  ran=$((ran + 1))
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort)

if [ "$DRY_RUN" = "1" ]; then
  echo ">> Dry run: $ran migration(s) pending"
else
  echo ">> Migrations up to date ($ran applied in this run)"
fi

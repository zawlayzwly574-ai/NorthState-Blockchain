#!/usr/bin/env bash
set -euo pipefail

readonly database_name="northstar_release_validation"
readonly original_database_url="${DATABASE_URL:-}"
readonly production_database_url="${PRODUCTION_DATABASE_URL:-}"
readonly deployment_database_url="${DEPLOYMENT_DATABASE_URL:-}"

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  echo "Refusing externally supplied TEST_DATABASE_URL. Release validation creates its own disposable database." >&2
  exit 1
fi

data_dir="$(mktemp -d "${TMPDIR:-/tmp}/northstar-release-db.XXXXXX")"
log_file="$data_dir/postgres.log"
port="$(
  node -e '
    const server = require("node:net").createServer();
    server.listen(0, "127.0.0.1", () => {
      console.log(server.address().port);
      server.close();
    });
  '
)"
test_database_url="postgresql://postgres@127.0.0.1:${port}/${database_name}"
postgres_started=false

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ "$exit_code" -ne 0 && -s "$log_file" ]]; then
    echo "Disposable PostgreSQL log:" >&2
    cat "$log_file" >&2
  fi
  if [[ "$postgres_started" == true ]]; then
    pg_ctl -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$data_dir"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

for protected_url in \
  "$original_database_url" \
  "$production_database_url" \
  "$deployment_database_url"
do
  if [[ -n "$protected_url" && "$test_database_url" == "$protected_url" ]]; then
    echo "Refusing to use a development or production database for release validation." >&2
    exit 1
  fi
done

if [[ "$test_database_url" != postgresql://postgres@127.0.0.1:*"/${database_name}" ]]; then
  echo "Release validation database must be a local disposable database." >&2
  exit 1
fi

initdb -D "$data_dir" -A trust -U postgres --no-locale --encoding=UTF8 >/dev/null
pg_ctl \
  -D "$data_dir" \
  -l "$log_file" \
  -o "-F -p $port -h 127.0.0.1 -k $data_dir" \
  -w start >/dev/null
postgres_started=true

createdb \
  --host=127.0.0.1 \
  --port="$port" \
  --username=postgres \
  "$database_name"

echo "Applying the current Drizzle schema to the disposable release database..."
DATABASE_URL="$test_database_url" pnpm --filter @workspace/db run push:test

echo "Running API authentication release checks..."
DATABASE_URL="$test_database_url" \
  pnpm --filter @workspace/api-server run test:mocked-auth
env -u DATABASE_URL \
  TEST_DATABASE_URL="$test_database_url" \
  pnpm --filter @workspace/api-server run test:database-auth
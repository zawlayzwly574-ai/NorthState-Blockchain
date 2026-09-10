#!/usr/bin/env bash
set -euo pipefail

readonly release_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/release-api-auth.sh"
harness_root="$(mktemp -d "${TMPDIR:-/tmp}/northstar-release-harness.XXXXXX")"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ -f "$harness_root/postgres.pid" ]]; then
    postgres_pid="$(cat "$harness_root/postgres.pid")"
    kill "$postgres_pid" >/dev/null 2>&1 || true
    wait "$postgres_pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$harness_root"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

fail() {
  echo "release-api-auth lifecycle test failed: $*" >&2
  exit 1
}

make_fake_commands() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"

  cat >"$bin_dir/initdb" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
touch "$HARNESS_STATE_DIR/initdb-called"
EOF

  cat >"$bin_dir/createdb" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
touch "$HARNESS_STATE_DIR/createdb-called"
EOF

  cat >"$bin_dir/pg_ctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

action="${*: -1}"
case "$action" in
  start)
    sleep 300 &
    echo "$!" >"$HARNESS_STATE_DIR/postgres.pid"
    touch "$HARNESS_STATE_DIR/postgres-started"
    ;;
  stop)
    postgres_pid="$(cat "$HARNESS_STATE_DIR/postgres.pid")"
    kill "$postgres_pid"
    wait "$postgres_pid" 2>/dev/null || true
    rm -f "$HARNESS_STATE_DIR/postgres.pid"
    touch "$HARNESS_STATE_DIR/postgres-stopped"
    ;;
  *)
    echo "Unexpected pg_ctl action: $action" >&2
    exit 1
    ;;
esac
EOF

  cat >"$bin_dir/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

count_file="$HARNESS_STATE_DIR/pnpm-count"
count=0
if [[ -f "$count_file" ]]; then
  count="$(cat "$count_file")"
fi
count=$((count + 1))
echo "$count" >"$count_file"

if [[ "${HARNESS_FAIL_PNPM_CALL:-0}" == "$count" ]]; then
  exit 42
fi
EOF

  chmod +x "$bin_dir/initdb" "$bin_dir/createdb" "$bin_dir/pg_ctl" "$bin_dir/pnpm"
}

assert_no_temporary_cluster() {
  local temp_dir="$1"
  if find "$temp_dir" -mindepth 1 -print -quit | grep -q .; then
    fail "temporary cluster directory was not removed from $temp_dir"
  fi
}

assert_postgres_stopped() {
  local state_dir="$1"
  [[ -f "$state_dir/postgres-stopped" ]] || fail "PostgreSQL stop was not requested"
  [[ ! -f "$state_dir/postgres.pid" ]] || fail "PostgreSQL process marker remains"
}

run_rejection_case() {
  local case_dir="$harness_root/rejection"
  mkdir -p "$case_dir/tmp" "$case_dir/state" "$case_dir/bin"
  make_fake_commands "$case_dir/bin"

  set +e
  output="$(
    TMPDIR="$case_dir/tmp" \
      PATH="$case_dir/bin:$PATH" \
      HARNESS_STATE_DIR="$case_dir/state" \
      TEST_DATABASE_URL="postgresql://external.invalid/test" \
      bash "$release_script" 2>&1
  )"
  exit_code=$?
  set -e

  [[ "$exit_code" -ne 0 ]] || fail "externally supplied TEST_DATABASE_URL was accepted"
  [[ "$output" == *"Refusing externally supplied TEST_DATABASE_URL"* ]] ||
    fail "rejection reason was not reported"
  [[ ! -e "$case_dir/state/initdb-called" ]] || fail "PostgreSQL initialization ran before rejection"
  assert_no_temporary_cluster "$case_dir/tmp"
}

run_cleanup_case() {
  local name="$1"
  local failing_pnpm_call="$2"
  local expected_exit_code="$3"
  local case_dir="$harness_root/$name"
  mkdir -p "$case_dir/tmp" "$case_dir/state" "$case_dir/bin"
  make_fake_commands "$case_dir/bin"

  set +e
  TMPDIR="$case_dir/tmp" \
    PATH="$case_dir/bin:$PATH" \
    HARNESS_STATE_DIR="$case_dir/state" \
    HARNESS_FAIL_PNPM_CALL="$failing_pnpm_call" \
    bash "$release_script" >/dev/null 2>&1
  exit_code=$?
  set -e

  [[ "$exit_code" -eq "$expected_exit_code" ]] ||
    fail "$name path exited with $exit_code instead of $expected_exit_code"
  [[ -f "$case_dir/state/postgres-started" ]] || fail "$name path did not start PostgreSQL"
  assert_postgres_stopped "$case_dir/state"
  assert_no_temporary_cluster "$case_dir/tmp"
}

run_rejection_case
run_cleanup_case "failing-command" 2 42
run_cleanup_case "successful-command" 0 0

echo "release-api-auth lifecycle checks passed"
#!/bin/sh
# Runs every migration, the legacy grants check and the partner RLS test on a throwaway local Postgres.
#   cd v2 && sh supabase/tests/local/run-rls.sh
# Needs the Postgres 16 client and server binaries (Homebrew postgresql@16).
# Exits 0 only when the test reports a result and every check in it is true.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
supa=$(cd "$here/../.." && pwd)
dir=$(mktemp -d "${TMPDIR:-/tmp}/gs-rls.XXXXXX")
port=$((54000 + $$ % 1000))
cleanup() {
  pg_ctl -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT INT TERM

initdb -D "$dir/data" -A trust -U postgres >/dev/null
pg_ctl -D "$dir/data" -o "-k $dir -p $port -c listen_addresses=''" -l "$dir/server.log" -w start >/dev/null
psql_run() { psql -h "$dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql_run -f "$here/supabase-stub.sql"
# SKIP_MIGRATIONS=1 runs the test on the bare stub, to prove it fails without them.
if [ "${SKIP_MIGRATIONS:-}" != 1 ]; then
  for migration in "$supa"/migrations/*.sql; do
    psql_run -f "$migration"
  done
fi
# Raises on the first grant or index that is wrong. With SKIP_MIGRATIONS=1 it is expected to fail, and the
# partner test below still runs, to prove that one fails without the migrations too.
grants_failed=0
grants=$(psql_run -f "$supa/tests/legacy_grants.sql" 2>&1) || grants_failed=1
if [ "$grants_failed" = 1 ]; then
  printf '%s\n' "$grants" | grep -o 'LEGACY_GRANTS_FAIL.*' || true
  echo "legacy grants check failed"
  [ "${SKIP_MIGRATIONS:-}" = 1 ] || exit 1
else
  printf '%s\n' "$grants" | grep -o 'LEGACY_GRANTS_RESULT.*'
fi
out=$(psql_run -f "$supa/tests/partner_rls.sql" 2>&1 || true)
printf '%s\n' "$out" | sed -n 's/.*PARTNER_RLS_RESULT \(.*\)$/\1/p' | python3 -I -c '
import json, sys
text = sys.stdin.read().strip()
if not text:
    sys.exit("no PARTNER_RLS_RESULT: the test did not run to the end")
result = json.loads(text)
failed = sorted(k for k, v in result.items() if v is not True)
for key in sorted(result):
    print(("PASS " if result[key] is True else "FAIL ") + key)
print(f"{len(result) - len(failed)}/{len(result)} checks passed")
sys.exit(1 if failed else 0)
' || { printf '%s\n' "$out" | grep -v PARTNER_RLS_RESULT | head -20; exit 1; }
[ "$grants_failed" = 0 ] || exit 1

#!/bin/bash
# Database tests (TECH_PLAN §18). Each file in supabase/tests runs inside a transaction that's
# rolled back. Until Docker is set up they run on the linked project (--linked); with Docker,
# run `supabase start` and pass --local instead.
set -e
cd "$(dirname "$0")/.."
target="${1:---linked}"
fail=0
for f in supabase/tests/*.sql; do
  printf "%s … " "$(basename "$f")"
  if out=$(supabase db query "$target" -f "$f" 2>&1) && ! grep -qiE '"error"|ERROR|assert|failed' <<<"$out"; then
    echo "passed"
  else
    echo "FAILED"
    echo "$out" | tail -15
    fail=1
  fi
done
exit $fail

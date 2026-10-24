#!/bin/bash
# A copy of the database (the free Supabase plan has no automatic backups). Run weekly during the
# pilot: `pnpm backup`. Saves backups/tikka-<date>.dump; restore with pg_restore.
#
# Needs pg_dump 17 or newer:  brew install libpq && brew link --force libpq
# Asks for the database connection string unless SUPABASE_DB_URL is set. Use the "Session pooler"
# string from Supabase → Connect (the direct one needs IPv6), with your database password in it.
# It's typed in Terminal and never saved.
#
# The dump holds the data, accounts and file records; the photo and video files themselves stay in
# Supabase Storage.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v pg_dump >/dev/null; then
  echo "pg_dump isn't installed. Run: brew install libpq && brew link --force libpq" >&2
  exit 1
fi
major=$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
if [ "$major" -lt 17 ]; then
  echo "pg_dump $major is too old for the database (Postgres 17). Run: brew upgrade libpq" >&2
  exit 1
fi

url="${SUPABASE_DB_URL:-}"
if [ -z "$url" ]; then
  read -rsp "Session pooler connection string (with your password): " url
  echo
fi

mkdir -p backups
out="backups/tikka-$(date +%Y-%m-%d-%H%M).dump"
pg_dump "$url" --format=custom --no-owner --no-privileges --schema=public --schema=auth --schema=storage --file="$out"
echo "Saved $out ($(du -h "$out" | cut -f1)). Keep a copy somewhere other than this laptop."

#!/bin/bash
# Saves the Supabase keys into .env.local. Asks for each one; the secret key is hidden as you
# paste it and is never printed. Run: bash scripts/set-supabase-keys.sh
set -e
cd "$(dirname "$0")/.."

echo "Paste the PUBLISHABLE key (starts with sb_publishable_), then press Enter:"
read -r pub
echo "Paste the SECRET key (starts with sb_secret_). It stays hidden. Then press Enter:"
read -rs sec
echo

pub="$(echo "$pub" | tr -d '[:space:]')"
sec="$(echo "$sec" | tr -d '[:space:]')"
[[ "$pub" == sb_publishable_* ]] || { echo "That publishable key doesn't start with sb_publishable_. Nothing was saved. Try again."; exit 1; }
[[ "$sec" == sb_secret_* ]] || { echo "That secret key doesn't start with sb_secret_. Nothing was saved. Try again."; exit 1; }

cat > .env.local <<ENV
# Private settings for this computer. Never commit this file or paste the secret key anywhere.

NEXT_PUBLIC_SUPABASE_URL=https://ihqnatspbckwjusigwgl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$pub
SUPABASE_SECRET_KEY=$sec

NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV
echo "Saved. Both keys are in .env.local."

#!/bin/bash
set -e

echo "=== CKTV Deploy ==="

# 1. KV namespace (first time only)
if ! grep -q "PLACEHOLDER_ID" wrangler.toml 2>/dev/null; then
  echo "KV namespace already configured."
else
  echo "Creating KV namespace..."
  KV_OUTPUT=$(npx wrangler@3 kv namespace create CKTV_SEARCH_CACHE 2>&1)
  KV_ID=$(echo "$KV_OUTPUT" | grep -o '[a-f0-9]\{32\}')
  if [ -n "$KV_ID" ]; then
    sed -i '' "s/PLACEHOLDER_ID/$KV_ID/" wrangler.toml
    echo "KV ID: $KV_ID"
  else
    echo "Failed to create KV namespace. Check wrangler auth."
    exit 1
  fi
fi

# 2. Build
echo "Building..."
pnpm gen:runtime && pnpm gen:manifest && npx next build && npx @cloudflare/next-on-pages --experimental-minify

# 3. Deploy
echo "Deploying..."
npx wrangler@3 pages deploy .vercel/output/static --project-name ck-tv

echo "=== Done ==="

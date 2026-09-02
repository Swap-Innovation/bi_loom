#!/usr/bin/env bash
# Create or refresh local secret files from templates (safe to re-run).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p secrets

if [[ ! -f secrets/cursor.env ]]; then
  cp secrets/cursor.env.example secrets/cursor.env
  echo "Created secrets/cursor.env — add your CURSOR_API_KEY there."
else
  echo "secrets/cursor.env already exists (not overwritten)."
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example."
else
  echo ".env already exists (not overwritten)."
fi

echo ""
echo "Next steps:"
echo "  1. Edit secrets/cursor.env"
echo "     Set AI_MODE=live"
echo "     Set CURSOR_API_KEY=your-key-here"
echo "  2. Restart: docker compose up -d --build backend"

#!/usr/bin/env bash
# One-shot setup for a new Mac/Linux machine (optional; improves DX).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed or not on PATH."
  echo ""
  echo "  macOS (Homebrew):  brew install node@20 && brew link node@20 --force"
  echo "  Any OS:            https://nodejs.org/en/download/  (LTS 20+)"
  echo ""
  echo "Then run this script again, or use Docker (see README → “No Node on PATH”)."
  exit 1
fi

NODE_MAJOR="$(node -p "parseInt(process.version.slice(1), 10)")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node 20+ required. You have: $(node -v)"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found next to node. Reinstall Node from nodejs.org (includes npm)."
  exit 1
fi

if [ ! -f .env.dev ]; then
  if [ -f .env.example ]; then
    cp .env.example .env.dev
    echo "Created .env.dev from .env.example — fill in Supabase keys, JWT_SECRET, DATABASE_URL (for db:apply), etc."
  else
    echo "Missing .env.example; create .env.dev manually (see README)."
  fi
fi

echo "Installing dependencies (npm ci)..."
npm ci

echo ""
echo "Next:"
echo "  1) Edit .env.dev with your secrets"
echo "  2) npm run db:apply   (needs DATABASE_URL)  OR run SQL in Supabase dashboard"
echo "  3) npm run dev"
echo ""

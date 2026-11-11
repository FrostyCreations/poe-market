#!/usr/bin/env bash
# Cloudflare Pages build: copy only the public site into dist/ (functions/ is picked up separately).
set -euo pipefail
rm -rf dist
mkdir -p dist
cp index.html dist/
cp -r assets data dist/
cat > dist/_headers <<'H'
/assets/*
  Cache-Control: public, max-age=300
/data/playbook/*
  Cache-Control: public, max-age=3600
/data/user/*
  Cache-Control: no-store
H
echo "Built dist/ ($(find dist -type f | wc -l) files)"

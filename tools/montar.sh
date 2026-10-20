#!/usr/bin/env bash
# Monta a pasta dist (páginas + dados) que vai para a Cloudflare Pages.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/noticias dist/programa
cp -r site/. dist/
cp plano.json dist/ 2>/dev/null || true
cp noticias/*.json dist/noticias/ 2>/dev/null || true
rm -f dist/noticias/trends.json
cp programa/*.json dist/programa/ 2>/dev/null || true
cp programa/*.pdf dist/programa/ 2>/dev/null || true
[ -d marca ] && cp -r marca dist/ || true

#!/usr/bin/env bash
# Monta o site (páginas + dados) e publica na Cloudflare Pages, atrás do login.
# Precisa de CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e CF_PROJECT no ambiente.
set -euo pipefail
cd "$(dirname "$0")/.."
CF_PROJECT="${CF_PROJECT:-${GITHUB_REPOSITORY#*/}}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "$CF_PROJECT" ]; then echo "::warning::Publicação pulada: faltam os segredos da Cloudflare."; exit 0; fi
bash tools/montar.sh
[ -f wrangler.toml ] || { echo "::warning::Rode antes a rotina Publicar o site (ela prepara a Cloudflare)."; exit 0; }
for i in 1 2 3; do
  npx -y wrangler@3.78.12 pages deploy dist --project-name "$CF_PROJECT" --branch main --commit-dirty=true && exit 0
  sleep $((i*10))
done
echo "::error::Não consegui publicar na Cloudflare"; exit 1

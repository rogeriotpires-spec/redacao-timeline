#!/usr/bin/env bash
# Prepara a Cloudflare do cliente sem ninguém precisar abrir o painel dela:
# cria o projeto Pages, cria a lista de usuários (KV), grava wrangler.toml com o vínculo
# e guarda os segredos do site. Pode rodar quantas vezes quiser: só cria o que falta.
# Precisa de CLOUDFLARE_API_TOKEN (Pages: Edit e Workers KV Storage: Edit), CLOUDFLARE_ACCOUNT_ID,
# GH_PAT (token do GitHub do cliente) e SETUP_TOKEN (senha de uso único do primeiro administrador).
set -euo pipefail
cd "$(dirname "$0")/.."
CF_PROJECT="${CF_PROJECT:-${GITHUB_REPOSITORY#*/}}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then echo "::warning::Faltam CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID nos segredos do GitHub."; exit 0; fi
W="npx -y wrangler@3.78.12"
TMP=$(mktemp -d)

echo "1) Projeto Pages: $CF_PROJECT"
if (cd "$TMP" && $W pages project list 2>/dev/null) | grep -qw "$CF_PROJECT"; then echo "   já existe"
else (cd "$TMP" && $W pages project create "$CF_PROJECT" --production-branch main) && echo "   criado"; fi

echo "2) Lista de usuários (KV)"
TITULO="usuarios-$CF_PROJECT"
achar() { (cd "$TMP" && $W kv namespace list 2>/dev/null) | python3 -c "import json,sys,re;t=sys.argv[1];s=sys.stdin.read();s=s[s.find('['):];L=json.loads(s) if s else [];print(next((n['id'] for n in L if n['title']==t or n['title'].endswith('-'+t)),''))" "$TITULO"; }
KV=$(achar)
if [ -z "$KV" ]; then (cd "$TMP" && $W kv namespace create "$TITULO") >/dev/null; KV=$(achar); echo "   criada"; else echo "   já existe"; fi
[ -n "$KV" ] || { echo "::error::Não consegui criar a lista de usuários. O token da Cloudflare precisa da permissão Workers KV Storage: Edit."; exit 1; }

echo "3) wrangler.toml"
cat > wrangler.toml <<TOML
# Gerado por tools/cloudflare_preparar.sh. O id abaixo não é segredo.
name = "$CF_PROJECT"
pages_build_output_dir = "dist"
compatibility_date = "2024-09-23"

[[kv_namespaces]]
binding = "USUARIOS"
id = "$KV"
TOML

echo "4) Segredos do site"
TEM=$(cd "$TMP" && $W pages secret list --project-name "$CF_PROJECT" 2>/dev/null || true)
poe() { if echo "$TEM" | grep -q "$1"; then echo "   $1 já existe"; else printf '%s' "$2" | (cd "$TMP" && $W pages secret put "$1" --project-name "$CF_PROJECT") >/dev/null && echo "   $1 gravado"; fi; }
poe SESSION_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
poe GH_REPO "$GITHUB_REPOSITORY"
if [ -n "${GH_PAT:-}" ]; then poe GH_TOKEN "$GH_PAT"; else echo "::warning::Falta o segredo GH_PAT: os botões do painel não vão disparar as rotinas."; fi
if [ -n "${SETUP_TOKEN:-}" ]; then poe SETUP_TOKEN "$SETUP_TOKEN"; fi
rm -rf "$TMP"
echo "ok: https://$CF_PROJECT.pages.dev"

#!/bin/bash
#
# deploy-frontend.sh - Build Astro + deploy a Cloudflare Pages
#
# Para deploys manuales / locales. En CI corre .github/workflows/deploy-frontend.yml
# automaticamente al hacer push a main.
#
# Requiere: CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en el entorno
# (estan en /Users/manduinca/marc-cloudflare-creds/.env.cloudflare, chmod 600).
#
# Uso:
#   source ~/marc-cloudflare-creds/.env.cloudflare
#   export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
#   ./infra/deploy-frontend.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: config file not found: $CONFIG_FILE"
    exit 1
fi
source "$CONFIG_FILE"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'

# ===================== PRE-FLIGHT =====================
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo -e "${RED}Error: CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID no estan en el entorno.${NC}"
    echo "Carga las credenciales:"
    echo "  source ~/marc-cloudflare-creds/.env.cloudflare"
    echo "  export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID"
    exit 1
fi

command -v node >/dev/null || { echo "node no instalado"; exit 1; }
command -v npm  >/dev/null || { echo "npm no instalado"; exit 1; }

cd "$REPO_ROOT"

# ===================== 1. INSTALL =====================
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}npm install...${NC}"
    npm install
fi

# ===================== 2. BUILD =====================
echo -e "${YELLOW}Build Astro (PUBLIC_API_URL=https://${PROD_API_FQDN}/sismos)...${NC}"
PUBLIC_API_URL="https://${PROD_API_FQDN}/sismos" npm run build

[ -d dist ] || { echo "Error: build no genero dist/"; exit 1; }

# ===================== 3. INCLUIR HTML LEGACY + ASSETS =====================
echo -e "${YELLOW}Copiando HTML legacy + assets a dist/...${NC}"
for h in *.html; do cp "$h" dist/; done
for d in css js images fonts; do
    [ -d "$d" ] && cp -r "$d" dist/
done
[ -f favicon.ico ] && cp favicon.ico dist/ || true

echo -e "${CYAN}  dist/: $(du -sh dist | cut -f1)${NC}"

# ===================== 4. DEPLOY A PAGES =====================
echo -e "${YELLOW}wrangler pages deploy...${NC}"
npx --yes wrangler@latest pages deploy dist \
    --project-name="$PAGES_PROJECT" \
    --branch=main \
    --commit-dirty=true

echo ""
echo -e "${GREEN}Deploy completo.${NC}"
echo ""
echo "  Sitio temp:  https://${PAGES_PROJECT}.pages.dev"
echo "  Apex:        https://${PROD_WEB_FQDN}"
echo "  www:         https://www.${PROD_WEB_FQDN}"
echo ""
echo -e "${CYAN}Tip:${NC} en CI, el push a main dispara .github/workflows/deploy-frontend.yml"

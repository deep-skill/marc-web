#!/bin/bash
#
# teardown-prod.sh - Destruye la infra AWS de produccion de marc-web
#
# Borra en orden inverso al setup: API Gateway, Lambda, IAM role.
#
# NO borra:
#   - Cloudflare Pages project marc-web (hay que borrarlo a mano si lo quieres ir).
#   - DNS records de Cloudflare (api.marc.com.pe, etc.).
#
# Uso: ./infra/teardown-prod.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: config file not found: $CONFIG_FILE"
    exit 1
fi
source "$CONFIG_FILE"

TAG_PREFIX="${PROJECT}-${ENV_NAME}"
ROLE_NAME="${TAG_PREFIX}-lambda-role"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log_step()    { echo -e "\n${YELLOW}[$1] $2${NC}"; }
log_success() { echo -e "${GREEN}  ok $1${NC}"; }
log_info()    { echo -e "${CYAN}  i  $1${NC}"; }

aws_cli() {
    aws --profile "$AWS_PROFILE" --region "$REGION" "$@"
}

echo -e "${RED}================================================${NC}"
echo -e "${RED}  marc-web - Teardown de produccion AWS         ${NC}"
echo -e "${RED}================================================${NC}"
echo ""
echo "Se borraran de la cuenta $ACCOUNT_ID (region $REGION):"
echo "  - API:        $API_NAME"
echo "  - Lambda:     $LAMBDA_FUNCTION_NAME"
echo "  - IAM role:   $ROLE_NAME"
echo ""
echo -e "${YELLOW}NO se toca: Cloudflare Pages $PAGES_PROJECT, DNS records.${NC}"
echo ""
read -p "Escribe 'borrar' para confirmar: " CONFIRM
[[ "$CONFIRM" == "borrar" ]] || { echo "Cancelado."; exit 0; }

# ===================== 1. API GATEWAY =====================
log_step "1/3" "API Gateway HTTP API..."
API_ID=$(aws_cli apigatewayv2 get-apis \
    --query "Items[?Name=='$API_NAME'].ApiId" --output text)
if [ -n "$API_ID" ]; then
    aws_cli apigatewayv2 delete-api --api-id "$API_ID"
    log_success "API eliminada: $API_ID"
else
    log_info "API no existe (skip)"
fi

# ===================== 2. LAMBDA =====================
log_step "2/3" "Lambda..."
if aws_cli lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" >/dev/null 2>&1; then
    aws_cli lambda delete-function --function-name "$LAMBDA_FUNCTION_NAME"
    log_success "Lambda eliminada: $LAMBDA_FUNCTION_NAME"
else
    log_info "Lambda no existe (skip)"
fi

LOG_GROUP="/aws/lambda/${LAMBDA_FUNCTION_NAME}"
if aws_cli logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" \
    --query "logGroups[?logGroupName=='$LOG_GROUP'].logGroupName" --output text | grep -q "$LOG_GROUP"; then
    aws_cli logs delete-log-group --log-group-name "$LOG_GROUP"
    log_success "Log group eliminado: $LOG_GROUP"
fi

# ===================== 3. IAM ROLE =====================
log_step "3/3" "IAM role..."
if aws_cli iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    ATTACHED=$(aws_cli iam list-attached-role-policies --role-name "$ROLE_NAME" \
        --query 'AttachedPolicies[].PolicyArn' --output text)
    for arn in $ATTACHED; do
        aws_cli iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn "$arn"
    done
    aws_cli iam delete-role --role-name "$ROLE_NAME"
    log_success "IAM role eliminado: $ROLE_NAME"
else
    log_info "IAM role no existe (skip)"
fi

rm -f "${SCRIPT_DIR}/prod-resources.txt"

echo ""
echo -e "${GREEN}Teardown AWS completo.${NC}"
echo ""
echo -e "${YELLOW}Recordar manualmente:${NC}"
echo "  - Borrar CNAME api.marc.com.pe en Cloudflare DNS"
echo "  - Si tambien quieres bajar el frontend:"
echo "      curl -X DELETE \"https://api.cloudflare.com/client/v4/accounts/\$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PAGES_PROJECT\" \\"
echo "          -H \"Authorization: Bearer \$CLOUDFLARE_API_TOKEN\""
echo "  - Actualizar ../devops-agents/docs/aws-inventory.md"
echo ""

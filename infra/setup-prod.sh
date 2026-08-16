#!/bin/bash
#
# setup-prod.sh - Provisiona infraestructura AWS de produccion para marc-web
#
# Crea: IAM role (Lambda execution), Lambda function (Node 20), API Gateway HTTP API
#       con CORS.
#
# El frontend NO esta en AWS: vive en Cloudflare Pages (proyecto marc-web).
# Setup de Pages: se hace una sola vez via API (ver infra/README.md) y los
# deploys subsecuentes corren automaticamente via .github/workflows/deploy-frontend.yml
# al hacer push a main, o manualmente con ./infra/deploy-frontend.sh.
#
# Idempotente: si re-ejecutas, detecta lo creado y actualiza configuracion/codigo.
#
# Uso: ./infra/setup-prod.sh
# Pre: AWS CLI configurado (profile default, cuenta DeepSkill 750548849241)
#      infra/config.env (copiar desde infra/config.env.example)

set -euo pipefail

# ===================== LOAD CONFIG =====================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: config file not found: $CONFIG_FILE"
    echo "Copia infra/config.env.example a infra/config.env y completa los valores."
    exit 1
fi

source "$CONFIG_FILE"

# Variables derivadas
TAG_PREFIX="${PROJECT}-${ENV_NAME}"
ROLE_NAME="${TAG_PREFIX}-lambda-role"
LAMBDA_DIR="${REPO_ROOT}/lambda/sismos"
LAMBDA_ZIP="/tmp/${LAMBDA_FUNCTION_NAME}.zip"

# ===================== COLORS =====================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log_step()    { echo -e "\n${YELLOW}[$1] $2${NC}"; }
log_success() { echo -e "${GREEN}  ok $1${NC}"; }
log_info()    { echo -e "${CYAN}  i  $1${NC}"; }
log_error()   { echo -e "${RED}  x  $1${NC}"; }

aws_cli() {
    aws --profile "$AWS_PROFILE" --region "$REGION" "$@"
}

# ===================== PRE-FLIGHT =====================
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  marc-web - Infra de produccion (AWS)          ${NC}"
echo -e "${GREEN}================================================${NC}"

command -v aws >/dev/null || { log_error "AWS CLI no instalado"; exit 1; }
command -v zip >/dev/null || { log_error "zip no instalado"; exit 1; }
command -v jq  >/dev/null || { log_error "jq no instalado (brew install jq)"; exit 1; }

ACTUAL_ACCOUNT=$(aws_cli sts get-caller-identity --query Account --output text) || {
    log_error "credenciales AWS no configuradas para profile '$AWS_PROFILE'"; exit 1;
}
if [ "$ACTUAL_ACCOUNT" != "$ACCOUNT_ID" ]; then
    log_error "cuenta AWS no coincide: esperado $ACCOUNT_ID, actual $ACTUAL_ACCOUNT"
    exit 1
fi
log_info "AWS Account: $ACTUAL_ACCOUNT | Region: $REGION | Profile: $AWS_PROFILE"

if [ ! -f "$LAMBDA_DIR/index.mjs" ]; then
    log_error "no encuentro $LAMBDA_DIR/index.mjs (el codigo del Lambda)"
    exit 1
fi

# ===================== CONFIRM =====================
echo ""
echo -e "${YELLOW}Resumen:${NC}"
echo "  Account:    $ACCOUNT_ID"
echo "  Region:     $REGION"
echo "  Lambda:     $LAMBDA_FUNCTION_NAME ($LAMBDA_RUNTIME, ${LAMBDA_MEMORY}MB, ${LAMBDA_TIMEOUT}s)"
echo "  API:        $API_NAME (HTTP API, CORS para $ALLOWED_ORIGINS)"
echo "  API FQDN:   $PROD_API_FQDN"
echo "  Frontend:   Cloudflare Pages ($PAGES_PROJECT) - NO se provisiona aqui"
echo ""
read -p "Continuar? (y/N): " CONFIRM
[[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]] || { echo "Cancelado."; exit 0; }

# ===================== 1. IAM ROLE PARA LAMBDA =====================
log_step "1/4" "IAM role para Lambda execution..."

ROLE_ARN=$(aws_cli iam get-role --role-name "$ROLE_NAME" \
    --query 'Role.Arn' --output text 2>/dev/null || echo "")

if [ -z "$ROLE_ARN" ]; then
    TRUST_POLICY='{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }'
    ROLE_ARN=$(aws_cli iam create-role --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY" \
        --tags "Key=Name,Value=$ROLE_NAME" "Key=Environment,Value=$ENV_NAME" "Key=Project,Value=$PROJECT" \
        --query 'Role.Arn' --output text)

    aws_cli iam attach-role-policy --role-name "$ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

    log_success "IAM role creado: $ROLE_ARN"
    log_info "esperando 10s para propagacion IAM..."
    sleep 10
else
    log_success "IAM role ya existe: $ROLE_ARN"
fi

# ===================== 2. LAMBDA FUNCTION =====================
log_step "2/4" "Lambda function..."

log_info "Empacando $LAMBDA_DIR en $LAMBDA_ZIP..."
rm -f "$LAMBDA_ZIP"
( cd "$LAMBDA_DIR" && zip -qr "$LAMBDA_ZIP" . -x "*.zip" "node_modules/*" )
log_info "zip: $(du -h "$LAMBDA_ZIP" | cut -f1)"

LAMBDA_ARN=$(aws_cli lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" \
    --query 'Configuration.FunctionArn' --output text 2>/dev/null || echo "")

if [ -z "$LAMBDA_ARN" ]; then
    LAMBDA_ARN=$(aws_cli lambda create-function \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --runtime "$LAMBDA_RUNTIME" \
        --role "$ROLE_ARN" \
        --handler "$LAMBDA_HANDLER" \
        --timeout "$LAMBDA_TIMEOUT" \
        --memory-size "$LAMBDA_MEMORY" \
        --zip-file "fileb://$LAMBDA_ZIP" \
        --tags "Name=$LAMBDA_FUNCTION_NAME,Environment=$ENV_NAME,Project=$PROJECT" \
        --query 'FunctionArn' --output text)
    log_success "Lambda creada: $LAMBDA_ARN"
else
    aws_cli lambda update-function-code \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --zip-file "fileb://$LAMBDA_ZIP" \
        --query 'FunctionArn' --output text > /dev/null
    aws_cli lambda update-function-configuration \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --runtime "$LAMBDA_RUNTIME" \
        --timeout "$LAMBDA_TIMEOUT" \
        --memory-size "$LAMBDA_MEMORY" \
        --query 'FunctionArn' --output text > /dev/null
    log_success "Lambda actualizada: $LAMBDA_ARN"
fi

# ===================== 3. API GATEWAY HTTP API =====================
log_step "3/4" "API Gateway HTTP API..."

API_ID=$(aws_cli apigatewayv2 get-apis \
    --query "Items[?Name=='$API_NAME'].ApiId" --output text)

CORS_CONFIG='{"AllowOrigins":["'"${ALLOWED_ORIGINS//,/\",\"}"'"],"AllowMethods":["GET","OPTIONS"],"AllowHeaders":["Content-Type"],"MaxAge":300}'

if [ -z "$API_ID" ]; then
    API_ID=$(aws_cli apigatewayv2 create-api \
        --name "$API_NAME" \
        --protocol-type HTTP \
        --cors-configuration "$CORS_CONFIG" \
        --tags "Name=$API_NAME,Environment=$ENV_NAME,Project=$PROJECT" \
        --query 'ApiId' --output text)
    log_success "API creada: $API_ID"
else
    aws_cli apigatewayv2 update-api --api-id "$API_ID" \
        --cors-configuration "$CORS_CONFIG" \
        --query 'ApiId' --output text > /dev/null
    log_success "API ya existe: $API_ID (CORS refrescado)"
fi

INTEGRATION_ID=$(aws_cli apigatewayv2 get-integrations --api-id "$API_ID" \
    --query "Items[?IntegrationUri=='$LAMBDA_ARN'].IntegrationId" --output text)

if [ -z "$INTEGRATION_ID" ]; then
    INTEGRATION_ID=$(aws_cli apigatewayv2 create-integration \
        --api-id "$API_ID" \
        --integration-type AWS_PROXY \
        --integration-uri "$LAMBDA_ARN" \
        --payload-format-version "2.0" \
        --query 'IntegrationId' --output text)
    log_success "Integration creada: $INTEGRATION_ID"
else
    log_success "Integration ya existe: $INTEGRATION_ID"
fi

ROUTE_KEY="GET /sismos"
ROUTE_ID=$(aws_cli apigatewayv2 get-routes --api-id "$API_ID" \
    --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" --output text)

if [ -z "$ROUTE_ID" ]; then
    ROUTE_ID=$(aws_cli apigatewayv2 create-route \
        --api-id "$API_ID" \
        --route-key "$ROUTE_KEY" \
        --target "integrations/$INTEGRATION_ID" \
        --query 'RouteId' --output text)
    log_success "Route creada: $ROUTE_KEY -> $ROUTE_ID"
else
    log_success "Route ya existe: $ROUTE_KEY"
fi

STAGE_NAME='$default'
STAGE_EXISTS=$(aws_cli apigatewayv2 get-stages --api-id "$API_ID" \
    --query "Items[?StageName=='$STAGE_NAME'].StageName" --output text)
if [ -z "$STAGE_EXISTS" ]; then
    aws_cli apigatewayv2 create-stage --api-id "$API_ID" \
        --stage-name "$STAGE_NAME" --auto-deploy \
        --query 'StageName' --output text > /dev/null
    log_success "Stage \$default creada (auto-deploy)"
else
    log_success "Stage \$default ya existe"
fi

STATEMENT_ID="apigw-invoke-${API_ID}"
aws_cli lambda add-permission \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --statement-id "$STATEMENT_ID" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/sismos" \
    > /dev/null 2>&1 || log_info "permiso lambda:InvokeFunction ya existe (skip)"

API_ENDPOINT=$(aws_cli apigatewayv2 get-api --api-id "$API_ID" \
    --query 'ApiEndpoint' --output text)
log_info "API endpoint nativo: $API_ENDPOINT"

# ===================== 4. RESOURCES FILE =====================
log_step "4/4" "Generando prod-resources.txt..."

RESOURCES_FILE="${SCRIPT_DIR}/prod-resources.txt"
cat > "$RESOURCES_FILE" <<EOF
# marc-web - Recursos de produccion
# Generado: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

REGION=${REGION}
ACCOUNT_ID=${ACCOUNT_ID}

# IAM
ROLE_NAME=${ROLE_NAME}
ROLE_ARN=${ROLE_ARN}

# Lambda
LAMBDA_FUNCTION_NAME=${LAMBDA_FUNCTION_NAME}
LAMBDA_ARN=${LAMBDA_ARN}

# API Gateway
API_NAME=${API_NAME}
API_ID=${API_ID}
API_ENDPOINT=${API_ENDPOINT}
ROUTE_KEY=${ROUTE_KEY}

# Cloudflare Pages (frontend - no provisionado por este script)
PAGES_PROJECT=${PAGES_PROJECT}
PAGES_DOMAIN_APEX=${PROD_WEB_FQDN}
PAGES_DOMAIN_WWW=www.${PROD_WEB_FQDN}

# Cloudflare DNS (gestionado por Pages automaticamente al adjuntar dominios):
#   CNAME api.marc.com.pe -> ${API_ENDPOINT#https://}    (Proxied, manual)
#   CNAME marc.com.pe     -> ${PAGES_PROJECT}.pages.dev   (auto-creado por Pages)
#   CNAME www.marc.com.pe -> ${PAGES_PROJECT}.pages.dev   (auto-creado por Pages)
EOF
log_success "prod-resources.txt generado"

# ===================== SUMMARY =====================
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Infraestructura AWS creada                     ${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "  ${CYAN}Lambda:${NC}      $LAMBDA_FUNCTION_NAME"
echo -e "  ${CYAN}API:${NC}         $API_ENDPOINT"
echo -e "  ${CYAN}Frontend:${NC}    Cloudflare Pages: $PAGES_PROJECT (gestionado fuera)"
echo ""
echo -e "${YELLOW}Proximos pasos:${NC}"
echo ""
echo "  1. DNS para el API en Cloudflare (manual una vez):"
echo "     CNAME api -> ${API_ENDPOINT#https://}    Proxied (naranja)"
echo ""
echo "  2. Deploy del frontend:"
echo "     - Automatico:  push a main dispara .github/workflows/deploy-frontend.yml"
echo "     - Manual:      ./infra/deploy-frontend.sh"
echo ""
echo "  3. Verificar:"
echo "     curl 'https://${PROD_API_FQDN}/sismos?anio=$(date +%Y)' | jq '. | length'"
echo "     open  https://${PROD_WEB_FQDN}/sismos/"
echo ""
echo "  4. Actualizar inventario:"
echo "     ../devops-agents/docs/aws-inventory.md (agregar recursos de marc-web)"
echo ""
echo -e "  ${CYAN}IDs guardados en:${NC} $RESOURCES_FILE"
echo ""

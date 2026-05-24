#!/bin/bash
#
# deploy-lambda.sh - Actualiza el codigo del Lambda marc-sismos-api
#
# Empaqueta lambda/sismos/ y hace update-function-code. NO toca config.
# Para deploys de codigo subsecuentes al primer setup-prod.sh.
#
# Uso: ./infra/deploy-lambda.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: config file not found: $CONFIG_FILE"
    exit 1
fi
source "$CONFIG_FILE"

LAMBDA_DIR="${REPO_ROOT}/lambda/sismos"
LAMBDA_ZIP="/tmp/${LAMBDA_FUNCTION_NAME}.zip"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

if [ ! -f "$LAMBDA_DIR/index.mjs" ]; then
    echo "Error: no encuentro $LAMBDA_DIR/index.mjs"
    exit 1
fi

echo -e "${YELLOW}Empacando $LAMBDA_DIR...${NC}"
rm -f "$LAMBDA_ZIP"
( cd "$LAMBDA_DIR" && zip -qr "$LAMBDA_ZIP" . -x "*.zip" "node_modules/*" )
echo -e "${CYAN}  zip: $(du -h "$LAMBDA_ZIP" | cut -f1)${NC}"

echo -e "${YELLOW}Subiendo a Lambda $LAMBDA_FUNCTION_NAME...${NC}"
NEW_VERSION=$(aws --profile "$AWS_PROFILE" --region "$REGION" lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --zip-file "fileb://$LAMBDA_ZIP" \
    --query 'Version' --output text)

# Esperar a que termine de aprovisionarse
aws --profile "$AWS_PROFILE" --region "$REGION" lambda wait function-updated \
    --function-name "$LAMBDA_FUNCTION_NAME"

echo -e "${GREEN}  ok Lambda actualizada (version $NEW_VERSION)${NC}"

# Smoke test
echo -e "${YELLOW}Smoke test...${NC}"
ANIO=$(date +%Y)
RESP=$(aws --profile "$AWS_PROFILE" --region "$REGION" lambda invoke \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --payload "{\"queryStringParameters\":{\"anio\":\"${ANIO}\"}}" \
    --cli-binary-format raw-in-base64-out \
    /tmp/lambda-response.json \
    --query 'StatusCode' --output text)

if [ "$RESP" = "200" ]; then
    BODY_STATUS=$(jq -r '.statusCode' /tmp/lambda-response.json 2>/dev/null || echo "?")
    COUNT=$(jq -r 'if .body then (.body | fromjson | length) else "?" end' /tmp/lambda-response.json 2>/dev/null || echo "?")
    echo -e "${GREEN}  ok statusCode $BODY_STATUS, ${COUNT} sismos en respuesta${NC}"
else
    echo "  ! invoke devolvio status $RESP, revisar /tmp/lambda-response.json"
fi
rm -f /tmp/lambda-response.json

# Lambda Sismos - IGP API Proxy

AWS Lambda que proxyea y cachea la API del IGP para el sitio marc.com.pe.

## Deploy manual

```bash
cd lambda/sismos
zip -r sismos-lambda.zip index.mjs package.json

aws lambda update-function-code \
  --function-name marc-sismos-api \
  --zip-file fileb://sismos-lambda.zip
```

## API Gateway

1. Crear HTTP API en API Gateway
2. Integrar con la Lambda `marc-sismos-api`
3. Configurar CORS:
   - Origin permitido: `https://marc.com.pe`
   - Métodos: `GET, OPTIONS`
   - Headers: `Content-Type`

## Variables de entorno

Agregar en `.env` del proyecto frontend:

```
PUBLIC_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod
```

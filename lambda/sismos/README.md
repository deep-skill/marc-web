# Lambda Sismos - IGP API Proxy

AWS Lambda que proxyea y cachea (10 min) la API del IGP para la página `/sismos` del sitio.

- **Función**: `marc-prod-sismos-api` (Node 20, cuenta deepskill `750548849241`, `us-east-1`)
- **Expuesta como**: `https://api.marc.com.pe/sismos` (API Gateway HTTP API `marc-prod-api`, stage `$default`)
- **CORS**: orígenes permitidos en `ALLOWED_ORIGINS` (aquí en `index.mjs` **y** en `infra/config.env` para el API Gateway — mantener ambos sincronizados)

## Deploy

```bash
./infra/deploy-lambda.sh   # empaqueta, sube y corre smoke test
```

El setup completo de infraestructura (rol IAM, Lambda, API Gateway, CORS) es `./infra/setup-prod.sh`; los IDs reales quedan en `infra/prod-resources.txt`.

## Frontend

El componente `src/components/MapaSismos.jsx` consume la API vía `PUBLIC_API_URL`, que debe ser la URL **base sin path** (el componente añade `/sismos`):

```
PUBLIC_API_URL=https://api.marc.com.pe
```

En CI está definida en `.github/workflows/deploy-frontend.yml`.

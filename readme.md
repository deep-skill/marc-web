# MARC Web

Sitio corporativo de MARC Ingeniería y Construcción SAC — [marc.com.pe](https://marc.com.pe).

- **Frontend**: HTML estático legacy + sección `/sismos` en Astro/React (`src/`). Se sirve desde Cloudflare Pages; cada push a `main` despliega vía GitHub Actions.
- **API de sismos**: `lambda/sismos/` (proxy cacheado del IGP) en AWS, expuesta como `api.marc.com.pe`. Scripts de infraestructura en `infra/`.

Guía de desarrollo y arquitectura: [CLAUDE.md](CLAUDE.md).

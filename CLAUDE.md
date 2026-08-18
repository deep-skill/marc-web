# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Sitio web corporativo en español para **MARC Ingeniería y Construcción SAC** (Perú). Es un híbrido: la mayoría de páginas son `.html` planos legacy (más dos endpoints `.php` para formularios), y la sección de sismos es una isla **Astro + React** en `src/` que se compila con npm. En producción el frontend vive en **Cloudflare Pages** y la API de sismos en **AWS** (ver "Despliegue e infraestructura").

## Commands

Para las páginas legacy no hay build/test/lint: se editan los `.html`/`css`/`js` y se validan en el navegador. La parte Astro sí tiene toolchain:

- **Astro (página de sismos)** — requiere Node >= 22.12:
  ```sh
  npm install
  PUBLIC_API_URL=https://api.marc.com.pe npm run dev    # dev server
  PUBLIC_API_URL=https://api.marc.com.pe npm run build  # genera dist/
  ```
  `PUBLIC_API_URL` es la URL **base** de la API, sin path — el componente le añade `/sismos`.
- **Vista previa local sin PHP** (estilos, JS, navegación): abrir `index.html` directamente, o servir el directorio:
  ```sh
  python3 -m http.server 8000
  ```
- **Vista previa con envío de formularios** (requiere PHP con `mail()` configurado): usar el servidor embebido de PHP desde la raíz del repo:
  ```sh
  php -S localhost:8000
  ```
  Los formularios `contact.html` → `contact.php` y `get-quote.html` → `quote.php` no funcionarán contra `python -m http.server` porque dependen del intérprete PHP.

## Architecture

### Sitio estático multipágina
Cada sección del sitio es un `.html` independiente en la raíz (no hay layout compartido ni includes). Esto significa que **cualquier cambio en header, navegación, footer, social links, datos de contacto o snippet de analítica debe replicarse manualmente en todas las páginas afectadas**. El menú principal aparece duplicado en `index.html`, `about-us.html`, `solutions*.html`, `contact.html`, etc. Para auditar el alcance de un cambio repetido, usar `grep -l` sobre los `.html` antes de editar.

Páginas comerciales activas en el menú principal: `index.html`, `about-us.html`, `testimonials.html`, `team.html`, `solutions.html`, `solutions-details.html`, `solutions-rock-and-soil-laboratory.html`, `solutions-gelology.html`, `solutions-geophysics.html`, `solutions-pavement-design.html`, `solutions-seismology.html`, `solutions-vial-security.html`, `contact.html`. Existen también páginas de plantilla (`shop.html`, `cart.html`, `checkout.html`, `my-account.html`, `single-product.html`, `news-*.html`, `single-post.html`, `faq.html`, `projects*.html`) que están desactivadas en la navegación pero aún presentes en el repo.

### Stack frontend
- **Bootstrap 3** (`css/bootstrap.min.css` + `js/bootstrap.min.js`) — base de grid y componentes (no Bootstrap 4/5).
- **jQuery 1.x/2.x** (`js/jquery.min.js`) — requerido por todos los plugins.
- Plugins: Owl Carousel (sliders), Magnific Popup (lightbox), menumaker (menú responsive en `js/menumaker.js`), Waypoints + CounterUp (contadores), ElevateZoom (zoom de producto), ajaxChimp, price-slider, smooth-scroll.
- Tipografías: Google Fonts (Poppins + Roboto) cargadas vía `<link>` desde cada página.

### `js/theme.js`
Único JS personalizado. Inicializa todos los plugins arriba mencionados (Owl en `#home-slider` y demás carruseles, preloader, navegación, contadores, etc.). Si una página nueva necesita uno de esos componentes, debe usar los selectores/clases que `theme.js` ya cablea — no crear inicializaciones paralelas.

### CSS
- `css/style.css` es el estilo principal del sitio en producción.
- `css/style-home2.css` y `css/style-home3.css` son variantes alternativas de homepage incluidas en la plantilla original; **no se cargan desde `index.html` actual**. Antes de editarlas, confirmar si realmente se están usando.

### Backend (formularios)
`contact.php` y `quote.php` reciben los `POST` de los formularios de contacto/cotización y envían correo vía `mail()` de PHP. Detalles importantes:
- La variable `$to` en ambos archivos está **vacía** (`$to = '';`). Debe definirse al dirección destino antes de desplegar a producción, o los correos no se enviarán.
- Los nombres de campo del formulario están acoplados a los `name="..."` de los `<input>` en `contact.html` / `get-quote.html` (p. ej. `name-contact`, `subject-contact`, `email-contact`, `phone-contact`, `cmy-name`, `message` para contacto; `name-quote`, `email-quote`, `phone-quote`, `cmp-name`, `prj-title`, `your-req` para cotización). Renombrar inputs requiere actualizar el `.php` correspondiente.
- En éxito redirigen a `index.html` mediante `header("Location:...")`; en fallo imprimen un mensaje plano. No hay validación ni protección CSRF/spam.

### Sección de sismos (Astro + React)
`src/pages/sismos.astro` monta `src/components/MapaSismos.jsx` (React + Leaflet), que consume la API de sismos. `astro.config.mjs` usa `build: { format: 'file' }` para generar `sismos.html` (no `sismos/index.html`) y así encajar con los links `href="sismos.html"` de los HTML legacy.

### Despliegue e infraestructura
- **Frontend**: Cloudflare Pages, proyecto `marc-web`, sirviendo `marc.com.pe` y `www.marc.com.pe`. Un push a `main` dispara `.github/workflows/deploy-frontend.yml`: compila Astro, copia los HTML legacy y assets a `dist/`, y publica con wrangler. El frontend NO está en AWS/S3. `functions/_middleware.js` (Pages Function) redirige `www` al apex con 301 — los `_redirects` de Pages no soportan reglas por hostname, no intentar esa vía.
- **`public/_routes.json` es obligatorio mientras exista `functions/`**: sin él, Pages hace que **toda** petición invoque la Function, assets incluidos (~55 invocaciones por visita al home en vez de 1), y eso consume la cuota de Workers & Pages. El archivo excluye `css/`, `js/`, `images/`, `fonts/`, `_astro/` y el favicon; al añadir un directorio de assets nuevo hay que agregarlo a `exclude`. La alternativa sin coste es mover el redirect a una Redirect Rule de zona en Cloudflare y borrar `functions/`.
- **API de sismos**: `lambda/sismos/index.mjs` es un proxy con caché del API del IGP, desplegado como Lambda `marc-prod-sismos-api` + API Gateway en la cuenta AWS de deepskill (`750548849241`, `us-east-1`), expuesto como `api.marc.com.pe`. Deploy de código: `./infra/deploy-lambda.sh`. Setup completo: `./infra/setup-prod.sh`. IDs reales en `infra/prod-resources.txt`.
- **CORS**: los orígenes permitidos viven en DOS sitios que deben mantenerse sincronizados — `ALLOWED_ORIGINS` en `infra/config.env` (aplica al API Gateway vía setup script) y la constante `ALLOWED_ORIGINS` en `lambda/sismos/index.mjs`. Añadir un dominio requiere actualizar ambos, correr `update-api` (o `setup-prod.sh`) y redesplegar la Lambda.
- **DNS**: gestionado en Cloudflare.

### Integraciones de terceros embebidas en `index.html`
- **Google Analytics** Universal (gtag) con id `UA-149873321-3`.
- **Facebook Customer Chat SDK** apuntando a `page_id="101927331580716"`.

Estas integraciones también están duplicadas página por página donde aparecen — buscar `gtag` o `fb-customerchat` antes de retirarlas/migrarlas.

### Imágenes y assets
`images/` está organizado por sección (`about/`, `blog/`, `bg/`, `solutions/`, `team/`, `projects/`, `testimonial/`, `client-*.jpg`, etc.). El homepage usa `<picture>` con `<source srcset>` para variantes desktop/móvil de los sliders (`slider-1.jpg` vs `slider-1-movil.jpg`) — al añadir nuevos sliders, replicar ese patrón en lugar de un `<img>` plano.

## Things to watch out for

- **Idioma**: el sitio es enteramente en español (`<html lang="es">`, textos UI, meta description). Cualquier texto nuevo debe ir en español.
- **Enlaces rotos conocidos en la plantilla original**: varias páginas referencian `solutions-rock-laboraty.html` (typo, el archivo real es `solutions-rock-and-soil-laboratory.html`). Si tocas navegación, prefiere corregir enlaces apuntando al archivo real.
- **No hay tests ni linter**. Validar visualmente en navegador (desktop + móvil, ya que los `<picture srcset>` cambian por breakpoint) tras editar HTML/CSS.
- **El header repetido entre páginas es la mayor fuente de drift**. Antes de aceptar un cambio "global", confirmar con `grep` que se replicó en todos los `.html` que lo contienen.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Sitio web corporativo estático en español para **MARC Ingeniería y Construcción SAC** (Perú). No hay sistema de build, ni gestor de paquetes, ni framework de pruebas — son archivos `.html` planos servidos directamente, más dos endpoints `.php` para los formularios.

## Commands

No existe pipeline de build/test/lint. El "desarrollo" es editar los `.html`/`css`/`js` y abrirlos en el navegador.

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

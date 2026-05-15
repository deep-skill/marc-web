import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const HISTORIAL_FILE = './data/sismos-history.json';
let lastScrapeTime = 0;
const SCRAPE_CACHE = 60 * 60 * 1000;

function ensureDataDir() {
  const dir = path.dirname(HISTORIAL_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadHistorial() {
  try {
    if (fs.existsSync(HISTORIAL_FILE)) {
      const data = fs.readFileSync(HISTORIAL_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error cargando historial:', e);
  }
  return { sismos: [] };
}

function saveHistorial(historial) {
  ensureDataDir();
  fs.writeFileSync(HISTORIAL_FILE, JSON.stringify(historial, null, 2));
}

function getDefaultLat(ubicacion) {
  const regions = [
    { keyword: 'Lima', lat: -12.0 }, { keyword: 'Arequipa', lat: -16.4 },
    { keyword: 'Ancash', lat: -9.5 }, { keyword: 'Ica', lat: -14.5 },
    { keyword: 'Piura', lat: -5.2 }, { keyword: 'Junin', lat: -11.5 },
    { keyword: 'Cusco', lat: -13.5 }, { keyword: 'Puno', lat: -15.0 },
    { keyword: 'Amazonas', lat: -5.5 }, { keyword: 'San Martin', lat: -7.0 },
    { keyword: 'Ucayali', lat: -8.5 }, { keyword: 'Madre de Dios', lat: -12.5 },
  ];
  for (const r of regions) {
    if (ubicacion.toLowerCase().includes(r.keyword.toLowerCase())) {
      return r.lat + (Math.random() * 0.5 - 0.25);
    }
  }
  return -9.5 + (Math.random() * 4 - 2);
}

function getDefaultLng(ubicacion) {
  const regions = [
    { keyword: 'Lima', lng: -77.0 }, { keyword: 'Arequipa', lng: -71.5 },
    { keyword: 'Ancash', lng: -78.5 }, { keyword: 'Ica', lng: -75.5 },
    { keyword: 'Piura', lng: -80.5 }, { keyword: 'Junin', lng: -75.0 },
    { keyword: 'Cusco', lng: -72.0 }, { keyword: 'Puno', lng: -70.0 },
    { keyword: 'Amazonas', lng: -77.5 }, { keyword: 'San Martin', lng: -76.5 },
    { keyword: 'Ucayali', lng: -74.5 }, { keyword: 'Madre de Dios', lng: -69.5 },
  ];
  for (const r of regions) {
    if (ubicacion.toLowerCase().includes(r.keyword.toLowerCase())) {
      return r.lng + (Math.random() * 0.5 - 0.25);
    }
  }
  return -75 + (Math.random() * 4 - 2);
}

function extractMonthFromOption(optionText) {
  const months = {
    'Enero': '01', 'Febrero': '02', 'Marzo': '03', 'Abril': '04',
    'Mayo': '05', 'Junio': '06', 'Julio': '07', 'Agosto': '08',
    'Septiembre': '09', 'Octubre': '10', 'Noviembre': '11', 'Diciembre': '12'
  };
  for (const [month, num] of Object.entries(months)) {
    if (optionText.includes(month)) {
      return num;
    }
  }
  return null;
}

// Test para ver la estructura de la pagina
async function testPageStructure() {
  console.log('🔍 Testeando estructura de pagina del IGP...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.goto('https://ultimosismo.igp.gob.pe/productos/reportes-sismicos', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  const info = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select')).map(s => ({
      id: s.id,
      name: s.name,
      className: s.className,
      length: s.options?.length || 0,
      firstOptions: Array.from(s.options || []).slice(0, 5).map(o => ({ value: o.value, text: o.text.substring(0, 40) }))
    }));
    
    return { selects, url: window.location.href };
  });
  
  console.log('📋 Resultado:', JSON.stringify(info, null, 2));
  
  await browser.close();
  return info;
}

async function scrapeMonth(page, codigoBase, mesNum, anio) {
  console.log(`  📅 Scraping: ${mesNum}/${anio}...`);
  
  try {
    // Ir a la pagina del evento
    const link = `https://ultimosismo.igp.gob.pe/evento/${codigoBase}`;
    await page.goto(link, { waitUntil: 'networkidle2', timeout: 10000 });
    await new Promise(r => setTimeout(r, 1500));
    
    // Extraer datos
    const datos = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      // Extraer magnitud
      const magMatch = bodyText.match(/Magnitud\s*[:\-]?\s*([\d.]+)/i);
      const magnitud = magMatch ? parseFloat(magMatch[1]) : null;
      
      // Extraer ubicacion
      const ubMatch = bodyText.match(/Ubicaci(?:ón|on)\s*[:\-]?\s*([^\n]+)/i);
      const ubicacion = ubMatch ? ubMatch[1].trim() : '';
      
      // Extraer coordenadas
      const coordMatch = bodyText.match(/Latitud y Longitud.*?:\s*([-\d.]+)[,\s]+([-\d.]+)/);
      const lat = coordMatch ? parseFloat(coordMatch[1]) : null;
      const lng = coordMatch ? parseFloat(coordMatch[2]) : null;
      
      // Extraer fecha/hora
      const fechaMatch = bodyText.match(/Fecha\s*y?\s*Hora.*?:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i);
      const fechaHora = fechaMatch ? fechaMatch[1].trim() : '';
      
      return { magnitud, ubicacion, lat, lng, fechaHora };
    });
    
    return datos;
  } catch (e) {
    console.log(`    ⚠️ Error obteniendo datos: ${e.message}`);
    return null;
  }
}

export async function scrapeHistorialIGP(force = false) {
  const now = Date.now();
  if (!force && now - lastScrapeTime < SCRAPE_CACHE) {
    console.log('📦 Usando caché del scraper de historial');
    return loadHistorial();
  }

  console.log('🔄 Iniciando scraping de historial del IGP (2026)...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto('https://ultimosismo.igp.gob.pe/productos/reportes-sismicos', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(r => setTimeout(r, 3000));

    // Obtener estructura de selects
    const selectsInfo = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      return selects.map((s, idx) => ({
        id: s.id,
        name: s.name,
        className: s.className,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() }))
      }));
    });

    console.log('📋 Selects encontrados:', selectsInfo.length);
    console.log('📋 Detalles:', JSON.stringify(selectsInfo.map(s => ({ id: s.id, name: s.name, className: s.className, count: s.options.length })), null, 2));

    // Cargar historial existente
    const historial = loadHistorial();
    const existingCodes = new Set(historial.sismos.map(s => s.codigo));

    // Buscar selects de anio y mes
    let anioSelect = null;
    let mesSelect = null;
    let anioIdx = -1;
    let mesIdx = -1;
    
    for (let i = 0; i < selectsInfo.length; i++) {
      const sel = selectsInfo[i];
      const hasYears = sel.options.some(o => /^\d{4}$/.test(o.value));
      const hasMonths = sel.options.some(o => /^\d{2}$/.test(o.value) || /\d{4}/.test(o.value));
      const isMonthSelect = sel.className.includes('month-select');
      
      if (hasYears && anioIdx === -1) {
        anioSelect = sel;
        anioIdx = i;
      }
      else if ((hasMonths || isMonthSelect) && mesIdx === -1) {
        mesSelect = sel;
        mesIdx = i;
      }
    }

    console.log('📅 Select anio índice:', anioIdx);
    console.log('📅 Select mes índice:', mesIdx);

    if (anioIdx === -1 || mesIdx === -1) {
      console.log('⚠️ No se encontraron selects esperados');
      return historial;
    }

    // Scrapear 2026
    const anio2026 = anioSelect.options.find(o => o.value === '2026');
    if (!anio2026) {
      console.log('⚠️ No se encontró opción 2026');
      return historial;
    }

    // Buscar años disponibles
    const aniosDisponibles = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      if (!selects[0]) return [];
      return Array.from(selects[0].options).map(o => o.value).filter(v => /^\d{4}$/.test(v));
    });
    
    console.log('📅 Años disponibles:', aniosDisponibles);
    
    // Procesar años disponibles (2025 y 2026)
    const aniosAProcesar = aniosDisponibles.filter(a => parseInt(a) >= 2025);

    // Procesar cada año
    for (const anio of aniosAProcesar) {
      console.log(`\n📅 Procesando año ${anio}...`);
      
      // Seleccionar año
      await page.evaluate((year) => {
        const selects = document.querySelectorAll('select');
        if (selects[0]) {
          selects[0].value = year;
          selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, anio);
      await new Promise(r => setTimeout(r, 5000));

      // Obtener meses disponibles para este año
      const mesesInfo = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        const monthSelect = selects[1];
        if (!monthSelect) return [];
        return Array.from(monthSelect.options).map(o => ({ value: o.value, text: o.text.trim() }));
      });

      console.log(`📅 Meses disponibles para ${anio}:`, mesesInfo.length);

      // Scrapear cada mes
      for (const mesOpt of mesesInfo) {
        const mesNum = extractMonthFromOption(mesOpt.text);
        if (!mesNum) continue;

        console.log(`\n➡️ Procesando ${anio} - ${mesOpt.text}...`);

        // Seleccionar mes
        await page.evaluate((val) => {
          const selects = document.querySelectorAll('select');
          if (selects[1]) {
            selects[1].value = val;
            selects[1].dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, mesOpt.value);
        
        await new Promise(r => setTimeout(r, 2000));
        
        // Hacer click en botón buscar
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const buscarBtn = buttons.find(b => b.textContent.toLowerCase().includes('buscar') || b.textContent.toLowerCase().includes('search'));
          if (buscarBtn) buscarBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));
      await new Promise(r => setTimeout(r, 2500));

      // Extraer tabla de sismos
      const sismosDelMes = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        const resultados = [];
        
        rows.forEach((row) => {
          const cols = row.querySelectorAll('td');
          if (cols.length >= 5) {
            const colsTexts = Array.from(cols).map(c => c.textContent.trim());
            
            // Buscar el link del código
            const linkEl = row.querySelector('td a') || cols[1].querySelector('a');
            const link = linkEl?.href || '';
            const codigoMatch = link.match(/evento\/(\S+)/);
            const codigo = codigoMatch ? `IGP/CENSIS/RS 2026-${codigoMatch[1]}` : colsTexts[1] || '';
            
            if (codigo && colsTexts[3]) {
              const magnitud = parseFloat(colsTexts[3]);
              if (!isNaN(magnitud)) {
                resultados.push({
                  codigo,
                  magnitud,
                  ubicacion: colsTexts[2] || '',
                  fechaHora: colsTexts[4] || '',
                  link: link
                });
              }
            }
          }
        });
        
        return resultados;
      });

      console.log(`  📊 Encontrados ${sismosDelMes.length} sismos`);

      // Obtener coordenadas para cada sismo
      const sismosConCoords = [];
      for (const s of sismosDelMes.slice(0, 10)) {
        const codigoNum = s.codigo.replace('IGP/CENSIS/RS 2026-', '');
        const datos = await scrapeMonth(page, codigoNum, mesNum, '2026');
        
        if (datos && datos.lat) {
          sismosConCoords.push({
            ...s,
            lat: datos.lat,
            lng: datos.lng,
            ubicacion: datos.ubicacion || s.ubicacion,
            fechaHora: datos.fechaHora || s.fechaHora
          });
        } else {
          sismosConCoords.push({
            ...s,
            lat: getDefaultLat(s.ubicacion),
            lng: getDefaultLng(s.ubicacion)
          });
        }
      }

      // Completar los demas con coords por defecto
      for (const s of sismosDelMes.slice(3)) {
        sismosConCoords.push({
          ...s,
          lat: getDefaultLat(s.ubicacion),
          lng: getDefaultLng(s.ubicacion)
        });
      }

      // Agregar solo nuevos al historial
      const nuevos = sismosConCoords.filter(s => !existingCodes.has(s.codigo));
      if (nuevos.length > 0) {
        historial.sismos = [...nuevos, ...historial.sismos];
        nuevos.forEach(s => existingCodes.add(s.codigo));
        console.log(`  ✅ Agregados ${nuevos.length} nuevos`);
      }
    }
    } // Fin loop año

    // Guardar
    saveHistorial(historial);
    lastScrapeTime = Date.now();
    
    console.log(`\n✅ Total historial: ${historial.sismos.length} sismos`);
    return historial;

  } catch (error) {
    console.error('❌ Error:', error.message);
    return loadHistorial();
  } finally {
    await browser.close();
  }
}

export async function GET({ url }) {
  const test = url.searchParams.get('test');
  const force = url.searchParams.get('force') === 'true' || true; // siempre forzar
  
  if (test === 'true') {
    const info = await testPageStructure();
    return new Response(JSON.stringify(info), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Resetear cache para forzar nuevo scrape
  lastScrapeTime = 0;
  
  try {
    const historial = await scrapeHistorialIGP(true);
    return new Response(JSON.stringify({
      success: true,
      total: historial.sismos.length,
      sismos: historial.sismos
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const prerender = false;
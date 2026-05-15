import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const HISTORIAL_FILE = './data/sismos-history.json';
const START_CODE = 1;
const MAX_CODE = 300;
const CONCURRENCY = 5;
const TIMEOUT = 8000;
const ANIO = '2026';

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

async function scrapeCode(page, codigoNum, codigo) {
  const url = `https://ultimosismo.igp.gob.pe/evento/${ANIO}-${codigoNum}`;
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
    await new Promise(r => setTimeout(r, 2000));
    
    const datos = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      if (bodyText.includes('No se encontró') || bodyText.includes('404') || bodyText.includes('Evento no encontrado') || bodyText.includes('不存在')) {
        return null;
      }
      
      // Magnitud: busca "M 3.6" o "M3.6"
      const magMatch = bodyText.match(/M\s*([\d.]+)/i);
      const magnitud = magMatch ? parseFloat(magMatch[1]) : null;
      
      if (!magnitud) return null;
      
      // Ubicación: busca la línea con "km al"
      const ubMatch = bodyText.match(/(\d+\s+km\s+[^\n]+)/i);
      const ubicacion = ubMatch ? ubMatch[1].trim() : '';
      
      // Coordenadas
      const coordMatch = bodyText.match(/Latitud y Longitud.*?:\s*([-\d.]+)[,\s]+([-\d.]+)/);
      const lat = coordMatch ? parseFloat(coordMatch[1]) : null;
      const lng = coordMatch ? parseFloat(coordMatch[2]) : null;
      
      // Fecha: "14 de mayo de 2026 a las 09:19:04 hrs"
      const fechaMatch = bodyText.match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d+)\s+a\s+las\s+(\d{2}:\d{2}:\d{2})/i);
      const meses = { 'enero':'01', 'febrero':'02', 'marzo':'03', 'abril':'04', 'mayo':'05', 'junio':'06', 'julio':'07', 'agosto':'08', 'septiembre':'09', 'octubre':'10', 'noviembre':'11', 'diciembre':'12' };
      const mesNum = meses[fechaMatch?.[2]?.toLowerCase()] || '01';
      const fechaHora = fechaMatch ? `${fechaMatch[1].padStart(2,'0')}/${mesNum}/${fechaMatch[3]} ${fechaMatch[4]}` : '';
      
      return { magnitud, ubicacion, lat, lng, fechaHora };
    });
    
    if (datos && datos.magnitud) {
      return {
        codigo,
        magnitud: datos.magnitud,
        ubicacion: datos.ubicacion || 'Ubicacion no disponible',
        fechaHora: datos.fechaHora || '',
        lat: datos.lat || -9.5,
        lng: datos.lng || -75,
        link: url
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function scrapeBatch(page, codes, existingCodes) {
  const results = [];
  for (const code of codes) {
    const codigoNum = String(code).padStart(4, '0');
    const codigo = `IGP/CENSIS/RS ${ANIO}-${codigoNum}`;
    
    if (existingCodes.has(codigo)) continue;
    
    const result = await scrapeCode(page, codigoNum, codigo);
    if (result) {
      results.push(result);
      existingCodes.add(codigo);
    }
  }
  return results;
}

export async function scrapeSismosFromSequence() {
  console.log('🔄 Iniciando scraping por secuencia de codigos (concurrencia: ' + CONCURRENCY + ')...');
  
  const historial = loadHistorial();
  const existingCodes = new Set(historial.sismos.map(s => s.codigo));
  
  console.log(`📊 Ya tenemos ${historial.sismos.length} sismos en historial`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    let nuevosEncontrados = 0;
    const nuevosSismos = [];
    let batchNum = 0;
    
    for (let code = START_CODE; code <= MAX_CODE; code += CONCURRENCY) {
      batchNum++;
      const batch = [];
      for (let i = 0; i < CONCURRENCY && code + i <= MAX_CODE; i++) {
        batch.push(code + i);
      }
      
      const results = await scrapeBatch(page, batch, existingCodes);
      nuevosSismos.push(...results);
      nuevosEncontrados += results.length;
      
      // Guardar después de cada lote
      if (results.length > 0) {
        historial.sismos = [...results, ...historial.sismos];
        saveHistorial(historial);
        console.log(`✅ Lote ${batchNum}: ${nuevosEncontrados} sismos (guardados)`);
      } else if (batchNum % 5 === 0) {
        console.log(`⚠️ Lote ${batchNum}: Sin sismos nuevos hasta código ${code + CONCURRENCY - 1}`);
      }
      
      // Parar si ya no hay más sismos
      if (results.length === 0 && nuevosEncontrados > 10 && batchNum > 10) {
        console.log(`✅ Fin - No hay más sismos después del código ${batch[batch.length-1]}`);
        break;
      }
    }
    
    console.log(`\n📊 Total encontrados: ${nuevosEncontrados} sismos nuevos`);
    console.log(`✅ Total historial: ${historial.sismos.length} sismos`);
    return historial;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return historial;
  } finally {
    await browser.close();
  }
}

export async function GET() {
  // Resetear y hacer scrape
  console.log('🚀 Iniciando scrapeo por secuencia...');
  
  try {
    const historial = await scrapeSismosFromSequence();
    
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
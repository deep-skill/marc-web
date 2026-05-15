import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { scrapeHistorialIGP } from './sismos/historial.js';

const CACHE_TIME = 60 * 1000;
let cachedData = null;
let lastFetch = 0;
let isFetching = false;

const HISTORIAL_FILE = './data/sismos-history.json';

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

async function scrapeIGP() {
  console.log('🔄 Iniciando scraping del IGP...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto('https://ultimosismo.igp.gob.pe/ultimo-sismo/sismos-reportados', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(r => setTimeout(r, 3000));
    
    await page.waitForFunction(() => {
      const table = document.querySelector('table');
      return table && table.querySelector('tbody tr');
    }, { timeout: 15000 });

    const sismos = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const resultados = [];
      
      rows.forEach((row, index) => {
        if (index >= 50) return;
        
        const cols = row.querySelectorAll('td');
        if (cols.length >= 5) {
          const codigo = cols[1]?.textContent?.trim() || '';
          const ubicacion = cols[2]?.textContent?.trim() || '';
          const magnitudText = cols[3]?.textContent?.trim() || '';
          const magnitud = parseFloat(magnitudText);
          const fechaHora = cols[4]?.textContent?.trim() || '';
          
          if (!isNaN(magnitud)) {
            resultados.push({ codigo, magnitud, ubicacion, fechaHora, link: '' });
          }
        }
      });
      
      return resultados;
    });

    console.log(`✅ Se encontraron ${sismos.length} sismos`);

    const sismosWithCoords = [];
    for (const s of sismos.slice(0, 30)) {
      try {
        const link = `https://ultimosismo.igp.gob.pe/evento/${s.codigo.replace('IGP/CENSIS/RS ', '')}`;
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 10000 });
        await new Promise(r => setTimeout(r, 1500));
        
        const coords = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          const match = bodyText.match(/Latitud y Longitud.*?:\s*([-\d.]+)[,\s]+([-\d.]+)/);
          if (match) {
            return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
          }
          return { lat: -9.5 + (Math.random() * 2 - 1), lng: -75 + (Math.random() * 2 - 1) };
        });
        
        sismosWithCoords.push({ ...s, ...coords, link });
      } catch (e) {
        sismosWithCoords.push({ ...s, lat: -9.5, lng: -75, link: '' });
      }
    }

    const allSismos = sismos.map((s) => {
      const withCoords = sismosWithCoords.find(sc => sc.codigo === s.codigo);
      if (withCoords) return withCoords;
      
      const lat = getDefaultLat(s.ubicacion);
      const lng = getDefaultLng(s.ubicacion);
      return { ...s, lat, lng, link: '' };
    });

    return {
      fechaActualizacion: new Date().toISOString(),
      sismos: allSismos
    };

  } catch (error) {
    console.error('❌ Error durante el scraping:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

function addToHistorial(newSismos) {
  const historial = loadHistorial();
  const existingCodes = new Set(historial.sismos.map(s => s.codigo));
  
  const nuevosSismos = newSismos.filter(s => !existingCodes.has(s.codigo));
  
  if (nuevosSismos.length > 0) {
    historial.sismos = [...nuevosSismos, ...historial.sismos];
    saveHistorial(historial);
    console.log(`📚 Se agregaron ${nuevosSismos.length} nuevos sismos al historial`);
    return nuevosSismos;
  }
  
  return [];
}

export async function GET({ url }) {
  const mes = url.searchParams.get('mes');
  const anio = url.searchParams.get('anio');
  const forceRefresh = url.searchParams.get('refresh') === 'true';
  const now = Date.now();
  
  // Si se pide un mes específico y no tenemos caché, scrapear historial
  if (mes && anio) {
    console.log(`📚 Solicitado mes ${mes}/${anio}, scrapear historial del IGP (force)...`);
    try {
      const historialData = await scrapeHistorialIGP(true); // force = true
      if (historialData && historialData.sismos) {
        cachedData = { sismos: historialData.sismos, fechaActualizacion: new Date().toISOString() };
        lastFetch = Date.now();
        console.log(`✅ Historial cargado: ${historialData.sismos.length} sismos`);
      }
    } catch (e) {
      console.error('Error scraper historial:', e);
    }
  } else if (!isFetching && (!cachedData || (now - lastFetch) > CACHE_TIME || forceRefresh)) {
    try {
      isFetching = true;
      console.log('🌐 Obteniendo datos frescos del IGP...');
      cachedData = await scrapeIGP();
      lastFetch = Date.now();
      
      addToHistorial(cachedData.sismos);
      
      console.log('✅ Datos actualizados correctamente');
    } catch (error) {
      console.error('❌ Error obteniendo sismos:', error);
    } finally {
      isFetching = false;
    }
  } else if (isFetching) {
    console.log('⏳ Ya hay una solicitud en progreso, esperando...');
    while (isFetching) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  let sismosFiltrados = cachedData?.sismos || [];
  
  if (mes && anio) {
    sismosFiltrados = sismosFiltrados.filter(s => {
      const fechaMatch = s.fechaHora.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (fechaMatch) {
        const mesSismo = fechaMatch[2];
        const anioSismo = fechaMatch[3];
        return mesSismo === mes && anioSismo === anio;
      }
      return false;
    });
  }

  const historialCompleto = loadHistorial();
  
  if (mes && anio) {
    sismosFiltrados = historialCompleto.sismos.filter(s => {
      const fechaMatch = s.fechaHora.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (fechaMatch) {
        const mesSismo = fechaMatch[2];
        const anioSismo = fechaMatch[3];
        return mesSismo === mes && anioSismo === anio;
      }
      return false;
    });
  }

  const response = {
    fechaActualizacion: cachedData?.fechaActualizacion || new Date().toISOString(),
    sismos: sismosFiltrados,
    historialTotal: historialCompleto.sismos.length,
    newest: cachedData?.sismos || []
  };

  return new Response(JSON.stringify(response), {
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60'
    }
  });
}

export const prerender = false;
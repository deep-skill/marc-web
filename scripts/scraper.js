import puppeteer from 'puppeteer';

const scrapeSismos = async () => {
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
            resultados.push({
              codigo,
              magnitud,
              ubicacion,
              fechaHora,
              link: ''
            });
          }
        }
      });
      
      return resultados;
    });

    console.log(`✅ Se encontraron ${sismos.length} sismos`);

    // Obtener coordenadas para los primeros 10
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
        console.log(`  ✓ ${s.codigo}: lat=${coords.lat}, lng=${coords.lng}`);
      } catch (e) {
        sismosWithCoords.push({ ...s, lat: -9.5, lng: -75, link: '' });
      }
    }

    // Para los que no tenemos coords, asignamos coords aproximadas basadas en la ubicación
    const allSismos = sismos.map((s, i) => {
      const withCoords = sismosWithCoords.find(sc => sc.codigo === s.codigo);
      if (withCoords) return withCoords;
      
      // Asignar coords genéricas por región
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
};

function getDefaultLat(ubicacion) {
  const regions = [
    { keyword: 'Lima', lat: -12.0 },
    { keyword: 'Arequipa', lat: -16.4 },
    { keyword: 'Ancash', lat: -9.5 },
    { keyword: 'Ica', lat: -14.5 },
    { keyword: 'Piura', lat: -5.2 },
    { keyword: 'Junin', lat: -11.5 },
    { keyword: 'Cusco', lat: -13.5 },
    { keyword: 'Puno', lat: -15.0 },
    { keyword: 'Amazonas', lat: -5.5 },
    { keyword: 'San Martin', lat: -7.0 },
    { keyword: 'Ucayali', lat: -8.5 },
    { keyword: 'Madre de Dios', lat: -12.5 },
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
    { keyword: 'Lima', lng: -77.0 },
    { keyword: 'Arequipa', lng: -71.5 },
    { keyword: 'Ancash', lng: -78.5 },
    { keyword: 'Ica', lng: -75.5 },
    { keyword: 'Piura', lng: -80.5 },
    { keyword: 'Junin', lng: -75.0 },
    { keyword: 'Cusco', lng: -72.0 },
    { keyword: 'Puno', lng: -70.0 },
    { keyword: 'Amazonas', lng: -77.5 },
    { keyword: 'San Martin', lng: -76.5 },
    { keyword: 'Ucayali', lng: -74.5 },
    { keyword: 'Madre de Dios', lng: -69.5 },
  ];
  for (const r of regions) {
    if (ubicacion.toLowerCase().includes(r.keyword.toLowerCase())) {
      return r.lng + (Math.random() * 0.5 - 0.25);
    }
  }
  return -75 + (Math.random() * 4 - 2);
}

import fs from 'fs';

scrapeSismos()
  .then(data => {
    fs.writeFileSync('public/sismos.json', JSON.stringify(data, null, 2));
    console.log('✅ Datos guardados en public/sismos.json');
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
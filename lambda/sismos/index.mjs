const CACHE_TIME = 10 * 60 * 1000;
const USER_AGENT = 'MARC-Web/2.0 (+contacto@marc.com.pe)';
const IGP_API = 'https://ultimosismo.igp.gob.pe/api/ultimo-sismo/ajaxb';

const cache = {};
const cacheTime = {};

const ALLOWED_ORIGIN = 'https://marc.com.pe';

export const handler = async (event) => {
  const params = event.queryStringParameters || {};
  const anio = params.anio || String(new Date().getFullYear());
  const mes = params.mes;
  const now = Date.now();

  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=600',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    if (!cache[anio] || (now - cacheTime[anio]) >= CACHE_TIME) {
      const res = await fetch(`${IGP_API}/${anio}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`IGP responded ${res.status}`);
      const raw = await res.json();
      cache[anio] = raw.map((s) => ({
        codigo: s.codigo,
        magnitud: s.magnitud,
        referencia: s.referencia,
        fecha_local: s.fecha_local,
        hora_local: s.hora_local,
        latitud: s.latitud,
        longitud: s.longitud,
        profundidad: s.profundidad,
        intensidad: s.intensidad,
        tipomagnitud: s.tipomagnitud,
      }));
      cacheTime[anio] = now;
    }

    const data = mes ? filterByMonth(cache[anio], mes) : cache[anio];
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { ...corsHeaders, 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Error fetching sismos', detail: error.message }),
    };
  }
};

function filterByMonth(data, mes) {
  return data.filter((s) => {
    if (!s.fecha_local) return false;
    const m = String(new Date(s.fecha_local).getMonth() + 1).padStart(2, '0');
    return m === mes;
  });
}

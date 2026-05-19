const CACHE_TIME = 10 * 60 * 1000;
let cache = null;
let cacheTime = 0;

const USER_AGENT = 'MARC-Web/2.0 (+contacto@marc.com.pe)';
const IGP_API = 'https://ultimosismo.igp.gob.pe/api/ultimo-sismo/ajaxb';

export async function GET({ request }) {
  const now = Date.now();
  const url = new URL(request.url);
  const mes = url.searchParams.get('mes');
  const anio = url.searchParams.get('anio') || new Date().getFullYear();

  if (cache && (now - cacheTime) < CACHE_TIME) {
    const filtered = filterByMonth(cache, mes);
    return new Response(JSON.stringify(filtered), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
      },
    });
  }

  try {
    const res = await fetch(`${IGP_API}/${anio}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`IGP API responded with status ${res.status}`);
    }

    const data = await res.json();
    cache = data;
    cacheTime = now;

    const filtered = filterByMonth(data, mes);
    return new Response(JSON.stringify(filtered), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Error fetching sismos', detail: error.message }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

function filterByMonth(data, mes) {
  if (!mes) return data;

  return data.filter(sismo => {
    if (!sismo.fecha_local) return false;
    const fecha = new Date(sismo.fecha_local);
    const mesSismo = String(fecha.getMonth() + 1).padStart(2, '0');
    return mesSismo === mes;
  });
}

import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const COLORS = {
  primary: '#1f3c88',
  dark: '#162d66',
  red: '#dc2626',
  orange: '#f97316',
  green: '#22c55e',
};

const MESES = [
  { value: '', label: 'Todos los meses' },
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const getLabel = (mag) => {
  if (mag >= 6) return 'Mayor';
  if (mag >= 4.5) return 'Moderado';
  return 'Menor';
};

const getColor = (mag) => {
  if (mag >= 6) return COLORS.red;
  if (mag >= 4.5) return COLORS.orange;
  return COLORS.green;
};

const getIcon = (mag, isSelected = false) => {
  const color = getColor(mag);
  const size = isSelected ? 38 : 30;
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      border: ${isSelected ? '4px' : '3px'} solid white;
      box-shadow: 0 3px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: ${isSelected ? '14px' : '12px'};
      cursor: pointer;
    ">${mag}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const styles = {
  container: { padding: '0' },
  legend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '25px',
    marginBottom: '35px',
    flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '18px 28px',
    background: '#fff',
    borderRadius: '35px',
    boxShadow: '0 5px 20px rgba(0,0,0,0.1)',
  },
  legendDot: (color) => ({
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: color,
    boxShadow: `0 3px 8px ${color}80`,
  }),
  legendText: { color: '#222', fontWeight: '700', fontSize: '1.2rem' },
  mapWrapper: {
    background: '#fff',
    borderRadius: '14px',
    boxShadow: '0 6px 25px rgba(0,0,0,0.1)',
    overflow: 'hidden',
    marginBottom: '35px',
  },
  mapHeader: {
    background: COLORS.primary,
    color: '#fff',
    padding: '22px 28px',
    fontSize: '1.25rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  tableWrapper: {
    background: '#fff',
    borderRadius: '14px',
    boxShadow: '0 6px 25px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  tableHeader: {
    background: COLORS.primary,
    color: '#fff',
    padding: '22px 28px',
    fontSize: '1.25rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '1.3rem',
    fontFamily: 'Poppins, sans-serif',
  },
  th: {
    padding: '20px',
    textAlign: 'left',
    fontWeight: '700',
    color: '#333',
    borderBottom: `3px solid ${COLORS.primary}`,
    fontSize: '1.2rem',
  },
  td: { padding: '18px 20px', color: '#333', fontWeight: '600', fontSize: '1.2rem' },
  magBadge: (mag) => ({
    display: 'inline-block',
    padding: '10px 18px',
    borderRadius: '25px',
    fontWeight: '700',
    fontSize: '1.2rem',
    background: mag >= 4.5 ? '#fff3e0' : '#e8f5e9',
    color: mag >= 4.5 ? COLORS.orange : COLORS.green,
  }),
  typeBadge: (mag) => ({
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '1.1rem',
    fontWeight: '700',
    background: `${getColor(mag)}20`,
    color: getColor(mag),
  }),
  actionBtn: (isSelected) => ({
    background: isSelected ? COLORS.dark : COLORS.primary,
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '1.1rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  }),
  select: {
    padding: '8px 16px',
    fontSize: '1rem',
    borderRadius: '6px',
    border: 'none',
    color: '#333',
    fontWeight: '600',
    cursor: 'pointer',
    background: '#fff',
    minWidth: '160px',
  },
  verMasBtn: {
    background: COLORS.primary,
    color: '#fff',
    border: 'none',
    padding: '14px 40px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '1.1rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 4px 15px rgba(31,60,136,0.3)',
  },
  loading: { textAlign: 'center', padding: '80px' },
  footer: {
    textAlign: 'center',
    marginTop: '30px',
    color: '#666',
    fontSize: '1rem',
    fontWeight: '500',
  },
  popup: { minWidth: '300px', padding: '14px', fontFamily: 'Poppins, sans-serif' },
  popupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '14px',
    paddingBottom: '12px',
    borderBottom: '2px solid #eee',
  },
  popupMag: (color) => ({
    background: color,
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '25px',
    fontWeight: '700',
    fontSize: '20px',
  }),
  popupInfo: { fontSize: '15px', lineHeight: '1.8', color: '#444' },
  popupBtn: {
    background: COLORS.primary,
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '14px',
  },
};

export default function MapaSismos() {
  const [sismos, setSismos] = useState([]);
  const [todosSismos, setTodosSismos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSismo, setSelectedSismo] = useState(null);
  const [filtroMes, setFiltroMes] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const mapRef = useRef(null);

  const anioActual = new Date().getFullYear();
  const mesActual = MESES[new Date().getMonth()]?.label || '';

  const fetchSismos = () => {
    setLoading(true);
    setError(null);
    const baseUrl = import.meta.env.PUBLIC_API_URL;
    if (!baseUrl) {
      setError('Configuración incompleta: falta PUBLIC_API_URL.');
      setLoading(false);
      return;
    }
    fetch(`${baseUrl}?anio=${anioActual}`)
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then((data) => {
        const processed = procesarSismos(data);
        setSismos(processed);
        setTodosSismos(processed);
        setLoading(false);
      })
      .catch(() => {
        setError('No se pudieron cargar los datos del IGP. Intenta m\xc3\xa1s tarde.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSismos();
  }, [anioActual]);

  const procesarSismos = (data) => {
    if (!data || data.length === 0) return [];

    const parseFechaHora = (fechaLocal, horaLocal) => {
      if (!fechaLocal) return '';
      const fecha = fechaLocal.split('T')[0];
      let hora = '';
      if (horaLocal) {
        hora = horaLocal.includes('T') ? horaLocal.split('T')[1] : horaLocal;
        hora = hora.split('.')[0];
      }
      return hora ? `${fecha} ${hora}` : fecha;
    };

    const uniqueMap = new Map();
    data.forEach((sismo) => {
      if (!uniqueMap.has(sismo.codigo)) {
        uniqueMap.set(sismo.codigo, {
          codigo: `IGP/CENSIS/RS ${sismo.codigo}`,
          magnitud: parseFloat(sismo.magnitud),
          ubicacion: sismo.referencia,
          fechaHora: parseFechaHora(sismo.fecha_local, sismo.hora_local),
          lat: parseFloat(sismo.latitud),
          lng: parseFloat(sismo.longitud),
          profundidad: sismo.profundidad,
          intensidad: sismo.intensidad,
          link: `https://ultimosismo.igp.gob.pe/evento/${sismo.codigo}`,
        });
      }
    });

    const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
      const fechaA = new Date(a.fechaHora || '1970-01-01');
      const fechaB = new Date(b.fechaHora || '1970-01-01');
      return fechaB - fechaA;
    });

    return sorted;
  };

  useEffect(() => {
    setVisibleCount(10);
    setError(null);

    if (!filtroMes) {
      setSismos(todosSismos);
      return;
    }

    const filtered = todosSismos.filter((sismo) => {
      if (!sismo.fechaHora) return false;
      const mes = sismo.fechaHora.substring(5, 7);
      const anio = sismo.fechaHora.substring(0, 4);
      return mes === filtroMes && anio === String(anioActual);
    });

    setSismos(filtered);
  }, [filtroMes, todosSismos, anioActual]);

  const focusOnSismo = (sismo) => {
    setSelectedSismo(sismo);
    if (mapRef.current) {
      mapRef.current.setView([sismo.lat, sismo.lng], 10, { animate: true });
    }
    setTimeout(() => {
      const mapElement = document.querySelector('.map-container');
      if (mapElement) {
        mapElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        document.querySelector('.map-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  if (error) {
    return (
      <div style={styles.loading}>
        <i className="fa fa-exclamation-triangle" style={{ fontSize: '40px', color: COLORS.red }}></i>
        <p style={{ marginTop: '20px', color: '#333' }}>{error}</p>
        <button onClick={fetchSismos} style={styles.verMasBtn}>
          <i className="fa fa-refresh"></i> Reintentar
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <i className="fa fa-spinner fa-spin" style={{ fontSize: '40px', color: COLORS.primary }}></i>
        <p style={{ marginTop: '20px' }}>Cargando datos de sismos...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <span style={styles.legendDot(COLORS.red)}></span>
          <span style={styles.legendText}>≥ M6.0 - Mayor</span>
        </div>
        <div style={styles.legendItem}>
          <span style={styles.legendDot(COLORS.orange)}></span>
          <span style={styles.legendText}>M4.5 - M5.9 - Moderado</span>
        </div>
        <div style={styles.legendItem}>
          <span style={styles.legendDot(COLORS.green)}></span>
          <span style={styles.legendText}>&lt; M4.5 - Menor</span>
        </div>
      </div>

      <div className="map-wrapper" style={styles.mapWrapper}>
        <div style={styles.mapHeader}>
          <i className="fa fa-globe"></i> Mapa de Sismicidad {filtroMes ? `- ${MESES.find((m) => m.value === filtroMes)?.label}` : `- ${mesActual}`} {anioActual}
        </div>
        <div className="map-container">
          <MapContainer ref={mapRef} center={[-9.5, -75]} zoom={6} style={{ height: '480px', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {sismos.map((sismo) => (
              <Marker
                key={sismo.codigo}
                position={[sismo.lat, sismo.lng]}
                icon={getIcon(sismo.magnitud, selectedSismo?.codigo === sismo.codigo)}
                eventHandlers={{
                  click: () => focusOnSismo(sismo),
                }}
              >
                <Popup>
                  <div style={styles.popup}>
                    <div style={styles.popupHeader}>
                      <span style={styles.popupMag(getColor(sismo.magnitud))}>M {sismo.magnitud}</span>
                      <span style={{ color: getColor(sismo.magnitud), fontWeight: '700', fontSize: '15px' }}>
                        {getLabel(sismo.magnitud)}
                      </span>
                    </div>

                    <div style={styles.popupInfo}>
                      <p style={{ margin: '10px 0' }}>
                        <strong style={{ color: COLORS.primary, fontSize: '15px' }}>Referencia:</strong>
                        <br />
                        {sismo.ubicacion}
                      </p>
                      <p style={{ margin: '10px 0' }}>
                        <strong style={{ color: COLORS.primary, fontSize: '15px' }}>Fecha y Hora:</strong>
                        <br />
                        {sismo.fechaHora}
                      </p>
                      <p style={{ margin: '10px 0' }}>
                        <strong style={{ color: COLORS.primary, fontSize: '15px' }}>Codigo:</strong>
                        <br />
                        {sismo.codigo}
                      </p>
                      {sismo.profundidad && (
                        <p style={{ margin: '10px 0' }}>
                          <strong style={{ color: COLORS.primary, fontSize: '15px' }}>Profundidad:</strong>
                          <br />
                          {sismo.profundidad} km
                        </p>
                      )}
                    </div>

                    <div style={{ marginTop: '14px', padding: '12px', background: '#f0f4ff', borderRadius: '8px', textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          if (mapRef.current) mapRef.current.setView([sismo.lat, sismo.lng], 12, { animate: true });
                        }}
                        style={styles.popupBtn}
                      >
                        Centrar en Mapa
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      <div style={styles.tableWrapper}>
        <div style={styles.tableHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <i className="fa fa-list"></i> Registros de Sismos{' '}
            <span style={{ fontSize: '1rem', fontWeight: '500', opacity: 0.9 }}>
              (Mostrando: {Math.min(visibleCount, sismos.length)} de {sismos.length} sismos)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1rem', fontWeight: '500' }}>Filtrar:</span>
            <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} style={styles.select}>
              {MESES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead style={{ background: '#f8f9fa' }}>
              <tr>
                <th style={styles.th}>Fecha y Hora</th>
                <th style={styles.th}>Magnitud</th>
                <th style={styles.th}>Ubicación</th>
                <th style={styles.th}>Tipo</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {sismos.slice(0, visibleCount).map((sismo) => (
                <tr
                  key={sismo.codigo}
                  onClick={() => focusOnSismo(sismo)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    background: selectedSismo?.codigo === sismo.codigo ? '#e3f2fd' : 'transparent',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f4f8')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = selectedSismo?.codigo === sismo.codigo ? '#e3f2fd' : 'transparent')
                  }
                >
                  <td style={styles.td}>{sismo.fechaHora}</td>
                  <td style={styles.td}>
                    <span style={styles.magBadge(sismo.magnitud)}>M {sismo.magnitud}</span>
                  </td>
                  <td style={{ ...styles.td, fontWeight: '500', maxWidth: '400px' }}>{sismo.ubicacion}</td>
                  <td style={styles.td}>
                    <span style={styles.typeBadge(sismo.magnitud)}>{getLabel(sismo.magnitud)}</span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        focusOnSismo(sismo);
                      }}
                      style={styles.actionBtn(selectedSismo?.codigo === sismo.codigo)}
                    >
                      <i className="fa fa-map-marker"></i> Ver ubicación
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {visibleCount < sismos.length && (
          <div style={{ textAlign: 'center', padding: '25px' }}>
            <button onClick={() => setVisibleCount((prev) => prev + 10)} style={styles.verMasBtn}>
              <i className="fa fa-plus"></i> Ver más ({sismos.length - visibleCount} restantes)
            </button>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        * Los datos son proporcionados directamente por el Instituto Geofísico del Perú (IGP) - Total: {sismos.length} sismos
        registrados{filtroMes ? ` en ${MESES.find((m) => m.value === filtroMes)?.label}` : ''}
      </div>
    </div>
  );
}

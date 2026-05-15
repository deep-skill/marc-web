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
  green: '#22c55e'
};

export default function MapaSismos({ initialData }) {
  const [sismos, setSismos] = useState([]);
  const [todosSismos, setTodosSismos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSismo, setSelectedSismo] = useState(null);
  const [filtroMes, setFiltroMes] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const mapRef = useRef(null);

  console.log('MapaSismos initialData:', initialData);

  const meses = [
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

  // Función para procesar datos (ordenar por fecha y eliminar duplicados)
  const procesarSismos = (data) => {
    if (!data || data.length === 0) return [];
    
    // Eliminar duplicados por código
    const uniqueMap = new Map();
    data.forEach(sismo => {
      if (!uniqueMap.has(sismo.codigo)) {
        uniqueMap.set(sismo.codigo, sismo);
      }
    });
    
    // Ordenar por fecha (más recientes primero)
    const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
      // Convertir fechaHora a objeto Date para comparar
      const fechaA = new Date(a.fechaHora?.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') || '1970-01-01');
      const fechaB = new Date(b.fechaHora?.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') || '1970-01-01');
      return fechaB - fechaA;
    });
    
    console.log('Procesados:', sorted.length, 'sismos únicos');
    return sorted;
  };

  useEffect(() => {
    if (initialData && initialData.sismos && initialData.sismos.length > 0) {
      console.log('Usando datos iniciales del servidor:', initialData.sismos.length);
      const processed = procesarSismos(initialData.sismos);
      setSismos(processed);
      setTodosSismos(processed);
      setLoading(false);
      return;
    }
    
    console.log('Fetching sismos data from API...');
    fetch('/api/sismos.json')
      .then(res => {
        console.log('Response status:', res.status);
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        console.log('Data received:', data);
        console.log('Sismos count:', data.sismos?.length);
        const sismosData = data.newest || data.sismos || [];
        const processed = procesarSismos(sismosData);
        setSismos(processed);
        setTodosSismos(processed);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading sismos:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    console.log('Filtro cambiado a:', filtroMes);
    console.log('todosSismos actuales:', todosSismos.length);
    
    // Resetear contador de visibles al cambiar filtro
    setVisibleCount(10);
    
    if (!filtroMes) {
      setSismos(todosSismos);
      return;
    }
    
    // Filtrar localmente (más rápido que hacer fetch)
    const anioActual = 2026;
    const filtered = todosSismos.filter(sismo => {
      const fechaMatch = sismo.fechaHora?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!fechaMatch) return false;
      const mes = fechaMatch[2];
      const anio = fechaMatch[3];
      return mes === filtroMes && anio === String(anioActual);
    });
    
    console.log('Filtrados localmente:', filtered.length);
    setSismos(filtered);
  }, [filtroMes, todosSismos]);

  if (loading) {
    return (
      <div style={{textAlign: 'center', padding: '80px'}}>
        <i className="fa fa-spinner fa-spin" style={{fontSize: '40px', color: COLORS.primary}}></i>
        <p style={{marginTop: '20px'}}>Cargando datos de sismos...</p>
      </div>
    );
  }

  console.log('Rendering with sismos:', sismos.length);

  const getColor = (mag) => {
    if (mag >= 6) return COLORS.red;
    if (mag >= 4.5) return COLORS.orange;
    return COLORS.green;
  };

  const getLabel = (mag) => {
    if (mag >= 6) return 'Mayor';
    if (mag >= 4.5) return 'Moderado';
    return 'Menor';
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
      iconAnchor: [size/2, size/2]
    });
  };

  // Función para enfocar el mapa en un sismo
  const focusOnSismo = (sismo) => {
    setSelectedSismo(sismo);
    if (mapRef.current) {
      mapRef.current.setView([sismo.lat,sismo.lng], 10, { animate: true });
    }
    // Scroll al mapa
    setTimeout(() => {
      const mapElement = document.querySelector('.map-container');
      if (mapElement) {
        mapElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        document.querySelector('.map-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  return (
    <div style={{padding: '0'}}>
      {/* Stats - LEYENDA */}
      <div style={{display: 'flex', justifyContent: 'center', gap: '25px', marginBottom: '35px', flexWrap: 'wrap'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 28px', background: '#fff', borderRadius: '35px', boxShadow: '0 5px 20px rgba(0,0,0,0.1)'}}>
          <span style={{width: '24px', height: '24px', borderRadius: '50%', background: COLORS.red, boxShadow: '0 3px 8px rgba(220,38,38,0.5)'}}></span>
          <span style={{color: '#222', fontWeight: '700', fontSize: '1.2rem'}}>≥ M6.0 - Mayor</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 28px', background: '#fff', borderRadius: '35px', boxShadow: '0 5px 20px rgba(0,0,0,0.1)'}}>
          <span style={{width: '24px', height: '24px', borderRadius: '50%', background: COLORS.orange, boxShadow: '0 3px 8px rgba(249,115,22,0.5)'}}></span>
          <span style={{color: '#222', fontWeight: '700', fontSize: '1.2rem'}}>M4.5 - M5.9 - Moderado</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 28px', background: '#fff', borderRadius: '35px', boxShadow: '0 5px 20px rgba(0,0,0,0.1)'}}>
          <span style={{width: '24px', height: '24px', borderRadius: '50%', background: COLORS.green, boxShadow: '0 3px 8px rgba(34,197,94,0.5)'}}></span>
          <span style={{color: '#222', fontWeight: '700', fontSize: '1.2rem'}}>&lt; M4.5 - Menor</span>
        </div>
      </div>

      {/* Mapa */}
      <div className="map-wrapper" style={{background: '#fff', borderRadius: '14px', boxShadow: '0 6px 25px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '35px'}}>
        <div style={{background: COLORS.primary, color: '#fff', padding: '22px 28px', fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px'}}>
          <i className="fa fa-globe"></i> Mapa de Sismicidad {filtroMes ? `- ${meses.find(m => m.value === filtroMes)?.label}` : '- Mayo'} 2026
        </div>
        <div className="map-container">
          <MapContainer 
            ref={mapRef}
            center={[-9.5, -75]} 
            zoom={6} 
            style={{ height: '480px', width: '100%' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {sismos.map((sismo, index) => (
              <Marker 
                key={index}
                position={[sismo.lat,sismo.lng]} 
                icon={getIcon(sismo.magnitud, selectedSismo?.codigo === sismo.codigo)}
                eventHandlers={{
                  click: () => focusOnSismo(sismo),
                }}
              >
                <Popup>
                  <div style={{minWidth: '300px', padding: '14px', fontFamily: 'Poppins, sans-serif'}}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '12px', borderBottom: '2px solid #eee'}}>
                      <span style={{background: getColor(sismo.magnitud), color: '#fff', padding: '8px 16px', borderRadius: '25px', fontWeight: '700', fontSize: '20px'}}>
                        M {sismo.magnitud}
                      </span>
                      <span style={{color: getColor(sismo.magnitud), fontWeight: '700', fontSize: '15px'}}>
                        {getLabel(sismo.magnitud)}
                      </span>
                    </div>
                    
                    <div style={{fontSize: '15px', lineHeight: '1.8', color: '#444'}}>
                      <p style={{margin: '10px 0'}}><strong style={{color: COLORS.primary, fontSize: '15px'}}>Referencia:</strong><br/>{sismo.ubicacion}</p>
                      <p style={{margin: '10px 0'}}><strong style={{color: COLORS.primary, fontSize: '15px'}}>Fecha y Hora:</strong><br/>{sismo.fechaHora}</p>
                      <p style={{margin: '10px 0'}}><strong style={{color: COLORS.primary, fontSize: '15px'}}>Codigo:</strong><br/>{sismo.codigo}</p>
                    </div>

                    <div style={{marginTop: '14px', padding: '12px', background: '#f0f4ff', borderRadius: '8px', textAlign: 'center'}}>
                      <button 
                        onClick={() => {
                          if (mapRef.current) mapRef.current.setView([sismo.lat,sismo.lng], 12, { animate: true });
                        }}
                        style={{background: COLORS.primary, color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '14px'}}
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

      {/* Tabla */}
      <div style={{background: '#fff', borderRadius: '14px', boxShadow: '0 6px 25px rgba(0,0,0,0.1)', overflow: 'hidden'}}>
        <div style={{background: COLORS.primary, color: '#fff', padding: '22px 28px', fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            <i className="fa fa-list"></i> Registros de Sismos 
            <span style={{fontSize: '1rem', fontWeight: '500', opacity: 0.9}}>(Mostrando: {Math.min(visibleCount, sismos.length)} de {sismos.length} sismos)</span>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
            <span style={{fontSize: '1rem', fontWeight: '500'}}>Filtrar:</span>
            <select 
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
              style={{
                padding: '8px 16px',
                fontSize: '1rem',
                borderRadius: '6px',
                border: 'none',
                color: '#333',
                fontWeight: '600',
                cursor: 'pointer',
                background: '#fff',
                minWidth: '160px'
              }}
            >
              {meses.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '1.3rem', fontFamily: 'Poppins, sans-serif'}}>
            <thead style={{background: '#f8f9fa'}}>
              <tr>
                <th style={{padding: '20px', textAlign: 'left', fontWeight: '700', color: '#333', borderBottom: '3px solid ' + COLORS.primary, fontSize: '1.2rem'}}>Fecha y Hora</th>
                <th style={{padding: '20px', textAlign: 'left', fontWeight: '700', color: '#333', borderBottom: '3px solid ' + COLORS.primary, fontSize: '1.2rem'}}>Magnitud</th>
                <th style={{padding: '20px', textAlign: 'left', fontWeight: '700', color: '#333', borderBottom: '3px solid ' + COLORS.primary, fontSize: '1.2rem'}}>Ubicación</th>
                <th style={{padding: '20px', textAlign: 'left', fontWeight: '700', color: '#333', borderBottom: '3px solid ' + COLORS.primary, fontSize: '1.2rem'}}>Tipo</th>
                <th style={{padding: '20px', textAlign: 'center', fontWeight: '700', color: '#333', borderBottom: '3px solid ' + COLORS.primary, fontSize: '1.2rem'}}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {sismos.slice(0, visibleCount).map((sismo, index) => (
                <tr 
                  key={index}
                  onClick={() => focusOnSismo(sismo)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    background: selectedSismo?.codigo === sismo.codigo ? '#e3f2fd' : 'transparent',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f0f4f8'}
                  onMouseLeave={(e) => e.currentTarget.style.background = selectedSismo?.codigo === sismo.codigo ? '#e3f2fd' : 'transparent'}
                >
                  <td style={{padding: '18px 20px', color: '#333', fontWeight: '600', fontSize: '1.2rem'}}>{sismo.fechaHora}</td>
                  <td style={{padding: '18px 20px'}}>
                    <span style={{
                      display: 'inline-block',
                      padding: '10px 18px',
                      borderRadius: '25px',
                      fontWeight: '700',
                      fontSize: '1.2rem',
                      background: sismo.magnitud >= 4.5 ? '#fff3e0' : '#e8f5e9',
                      color: sismo.magnitud >= 4.5 ? COLORS.orange : COLORS.green
                    }}>
                      M {sismo.magnitud}
                    </span>
                  </td>
                  <td style={{padding: '18px 20px', color: '#333', fontWeight: '500', fontSize: '1.2rem', maxWidth: '400px'}}>{sismo.ubicacion}</td>
                  <td style={{padding: '18px 20px'}}>
                    <span style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '1.1rem',
                      fontWeight: '700',
                      background: getColor(sismo.magnitud) + '20',
                      color: getColor(sismo.magnitud)
                    }}>
                      {getLabel(sismo.magnitud)}
                    </span>
                  </td>
                  <td style={{padding: '18px 20px', textAlign: 'center'}}>
                    <button
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        focusOnSismo(sismo); 
                      }}
                      style={{
                        background: selectedSismo?.codigo === sismo.codigo ? COLORS.dark : COLORS.primary,
                        color: '#fff',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '1.1rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <i className="fa fa-map-marker"></i> Ver ubicación
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Botón Ver más */}
        {visibleCount < sismos.length && (
          <div style={{textAlign: 'center', padding: '25px'}}>
            <button 
              onClick={() => setVisibleCount(prev => prev + 10)}
              style={{
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
                boxShadow: '0 4px 15px rgba(31,60,136,0.3)'
              }}
            >
              <i className="fa fa-plus"></i> Ver más ({sismos.length - visibleCount} restantes)
            </button>
          </div>
        )}
      </div>

      <div style={{textAlign: 'center', marginTop: '30px', color: '#666', fontSize: '1rem', fontWeight: '500'}}>
        * Los datos son proporcionados directamente por el Instituto Geofísico del Perú (IGP) - Total: {sismos.length} sismos registrados{filtroMes ? ` en ${meses.find(m => m.value === filtroMes)?.label}` : ' en los últimos 30 días'}
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Clock, Download, FilePlus2, FileSpreadsheet, History, Loader2, PenLine, Save, Share2, Shuffle, UserMinus, Wrench, X,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { etiquetaDe } from '../camposExpediente';
import { nombrePlantilla } from '../plantillasCatalogo';
import { infoEstado, colorEstado } from '../estadosExpediente';

const ORIGEN = { individual: 'Caso individual', masivo: 'Carga masiva', manual: 'Captura manual', excel: 'Carga Excel' };

const fechaHora = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const hora = (ms) => {
  const d = ms ? new Date(Number(ms)) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
};
const valorCorto = (v) => {
  const t = String(v ?? '').trim();
  if (!t) return '(vacío)';
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
};

function describir(e) {
  const d = e.detalle || {};
  switch (e.tipo) {
    case 'creado': return { icono: FilePlus2, titulo: 'Expediente creado', color: '#64748b' };
    case 'guardar': return {
      icono: Save,
      titulo: 'Leyó los documentos y guardó el expediente',
      sub: [ORIGEN[d.origen] || '', d.leido_en ? `documentos leídos a las ${hora(d.leido_en)}` : '', d.plantilla ? nombrePlantilla(d.plantilla) : ''].filter(Boolean).join(' · '),
      cambios: d.cambios, tituloCambios: 'Corrigió a mano',
      color: '#2563eb',
    };
    case 'manual': return { icono: PenLine, titulo: 'Capturó el expediente a mano', sub: d.plantilla ? nombrePlantilla(d.plantilla) : '', color: '#7c3aed' };
    case 'excel': return { icono: FileSpreadsheet, titulo: 'Lo generó desde un Excel', sub: d.plantilla ? nombrePlantilla(d.plantilla) : '', color: '#15803d' };
    case 'word': return {
      icono: Download,
      titulo: d.cambios && Object.keys(d.cambios).length ? 'Editó datos y descargó el Word' : 'Descargó el Word',
      sub: d.plantilla ? nombrePlantilla(d.plantilla) : '',
      cambios: d.cambios, tituloCambios: 'Datos que cambió',
      color: '#0e7490',
    };
    case 'editar': return {
      icono: PenLine,
      titulo: 'Editó el expediente',
      sub: d.plantilla ? nombrePlantilla(d.plantilla) : '',
      cambios: d.cambios, tituloCambios: 'Datos que cambió',
      color: '#7c3aed',
    };
    case 'actualizar': return {
      icono: Save,
      titulo: 'Volvió a subir los documentos y actualizó el expediente',
      sub: [ORIGEN[d.origen] || '', d.plantilla ? nombrePlantilla(d.plantilla) : ''].filter(Boolean).join(' · '),
      cambios: d.cambios, tituloCambios: 'Datos que cambiaron',
      color: '#2563eb',
    };
    case 'estado': return { icono: Shuffle, titulo: 'Cambió el estado', estado: [d.de, d.a], color: '#b45309' };
    case 'compartir': return { icono: Share2, titulo: 'Compartió el expediente', sub: d.con?.length ? `con ${(d.con_nombres || d.con).join(', ')}` : '', color: '#7c3aed' };
    case 'quitar_acceso': return { icono: UserMinus, titulo: 'Quitó el acceso', sub: d.con?.length ? `a ${(d.con_nombres || d.con).join(', ')}` : '', color: '#64748b' };
    case 'corregir_plantilla': return {
      icono: Wrench,
      titulo: 'Se corrigió la plantilla',
      sub: 'Regresó a la plantilla con la que se guardó',
      cambios: d.de || d.a ? { plantilla_seleccionada: [d.de, d.a] } : null, tituloCambios: 'Corrección',
      color: '#0f766e',
    };
    default: return { icono: Clock, titulo: e.tipo, color: '#64748b' };
  }
}

// Ventana con el historial de cambios de un expediente (quién, cuándo y qué cambió)
export default function BitacoraExpediente({ expedienteId, titulo, datos, onCerrar }) {
  const { theme, isDarkMode, handleDownloadWord, descargandoId } = useApp();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    api.get(`/expedientes/${expedienteId}/bitacora`)
      .then((r) => { if (vivo) setInfo(r.data); })
      .catch((e) => { if (vivo) setError(e.response?.data?.detail || 'No se pudo cargar el historial.'); });
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => { vivo = false; window.removeEventListener('keydown', tecla); };
  }, [expedienteId, onCerrar]);

  const eventos = [...(info?.eventos || [])].reverse(); // lo más reciente arriba

  return (
    <div className="fondo-modal" onClick={onCerrar} role="dialog" aria-modal="true" aria-labelledby="bitacora-titulo">
      <div className="bitacora modal-entrada" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
        <header className="bitacora-encabezado" style={{ borderColor: theme.border }}>
          <span className="bitacora-icono" style={{ backgroundColor: `${theme.accent}1a`, color: theme.accent }}><History size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="bitacora-titulo">Historial de cambios</h3>
            <small style={{ color: theme.textSecondary }}>{titulo}{info?.numero_credito ? ` · Crédito ${info.numero_credito}` : ''}</small>
          </div>
          <button type="button" className="bitacora-cerrar" onClick={onCerrar} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={20} /></button>
        </header>

        {!info && !error && <div className="bitacora-cargando" style={{ color: theme.textSecondary }}><Loader2 size={18} className="girando" /> Cargando…</div>}
        {error && <div className="aviso-datos" style={{ margin: 16 }}><AlertTriangle size={16} /> {error}</div>}

        {info && (
          <div className="bitacora-cuerpo">
            <div className="bitacora-resumen" style={{ backgroundColor: theme.subtleBg, borderColor: theme.border }}>
              <div><small style={{ color: theme.textSecondary }}>Estado</small><span className="chip-estado estatico" style={colorEstado(info.estado, isDarkMode)}>{infoEstado(info.estado).nombre}</span></div>
              <div><small style={{ color: theme.textSecondary }}>Plantilla</small><strong>{nombrePlantilla(info.plantilla)}</strong></div>
              <div>
                <small style={{ color: theme.textSecondary }}>Versión de la plantilla</small>
                <strong>{info.version ? `del ${fechaHora(info.version.desde)}` : 'Sin registro (expediente anterior)'}</strong>
              </div>
            </div>

            {info.plantilla_cambio && (
              <div className="aviso-datos aviso-plantilla" style={{ backgroundColor: isDarkMode ? '#422006' : '#fffbeb', color: isDarkMode ? '#fcd34d' : '#92400e', borderColor: isDarkMode ? '#a16207' : '#fcd34d' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <strong>La plantilla cambió después de generar este Word.</strong> Al descargarlo se usa la misma versión de entonces para que salga igual.
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="boton-barra" disabled={descargandoId === expedienteId}
                      onClick={async () => { await handleDownloadWord(expedienteId, datos, info.plantilla, { plantillaActual: true }); onCerrar(); }}
                      style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                      {descargandoId === expedienteId ? <Loader2 size={14} className="girando" /> : <Download size={14} color={theme.accent} />} Descargar con la plantilla actual
                    </button>
                  </div>
                </div>
              </div>
            )}

            <ol className="bitacora-linea">
              {eventos.map((e, i) => {
                const d = describir(e);
                const Icono = d.icono;
                const cambios = Object.entries(d.cambios || {});
                return (
                  <li key={i} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                    <span className="bitacora-punto" style={{ backgroundColor: `${d.color}1f`, color: d.color, borderColor: theme.cardBg }}><Icono size={15} /></span>
                    <div className="bitacora-evento">
                      <div className="bitacora-evento-titulo">
                        <strong>{d.titulo}</strong>
                        {d.estado && (
                          <span className="bitacora-estados">
                            <span className="chip-estado estatico" style={colorEstado(d.estado[0], isDarkMode)}>{infoEstado(d.estado[0]).nombre}</span>
                            <ArrowRight size={13} />
                            <span className="chip-estado estatico" style={colorEstado(d.estado[1], isDarkMode)}>{infoEstado(d.estado[1]).nombre}</span>
                          </span>
                        )}
                      </div>
                      <small style={{ color: theme.textSecondary }}>{e.usuario === 'sistema' ? 'Sistema' : (e.nombre_usuario || e.usuario)} · {fechaHora(e.fecha)}{d.sub ? ` · ${d.sub}` : ''}</small>
                      {cambios.length > 0 && (
                        <div className="bitacora-cambios" style={{ borderColor: theme.border }}>
                          <div className="bitacora-cambios-titulo" style={{ color: theme.textSecondary }}>{d.tituloCambios} ({cambios.length})</div>
                          {cambios.map(([campo, [antes, despues]]) => (
                            <div key={campo} className="bitacora-cambio">
                              <span className="bitacora-campo">{campo === 'plantilla_seleccionada' ? 'Plantilla' : etiquetaDe(campo)}</span>
                              <span className="bitacora-antes" title={antes}>{campo === 'plantilla_seleccionada' ? nombrePlantilla(antes) : valorCorto(antes)}</span>
                              <ArrowRight size={12} className="bitacora-flecha" />
                              <span className="bitacora-despues" title={despues}>{campo === 'plantilla_seleccionada' ? nombrePlantilla(despues) : valorCorto(despues)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

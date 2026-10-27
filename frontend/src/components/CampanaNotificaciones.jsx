import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellRing, CheckCheck, Inbox, Share2, Users, X } from 'lucide-react';
import { useApp } from '../AppContext';

const hace = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 172800) return 'ayer';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};
const ICONOS = { compartir: Share2, compartir_todo: Users };

// Campana con el número de avisos sin leer; al abrirla se ve la lista (p. ej. «Ana te compartió 3 expedientes»)
export default function CampanaNotificaciones({ className = '', tam = 18, estilo = {} }) {
  const { theme, isDarkMode, notificaciones, marcarNotificaciones, cambiarPestana } = useApp();
  const [abierta, setAbierta] = useState(false);
  const [pos, setPos] = useState(null);
  const boton = useRef(null);
  const panel = useRef(null);
  const n = notificaciones?.no_leidas || 0;
  const lista = notificaciones?.lista || [];

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(380, window.innerWidth - 24);
    // Junto al menú lateral se abre a la derecha; en celular, hacia abajo
    const lateral = r.left < 320 && window.innerWidth > 860;
    setPos(lateral
      ? { left: r.right + 14, bottom: Math.max(12, window.innerHeight - r.bottom - 8), width: ancho }
      : { top: r.bottom + 8, left: Math.max(12, Math.min(r.right - ancho, window.innerWidth - ancho - 12)), width: ancho });
    setAbierta(true);
  };
  useEffect(() => {
    if (!abierta) return undefined;
    const fuera = (e) => { if (!panel.current?.contains(e.target) && !boton.current?.contains(e.target)) setAbierta(false); };
    const tecla = (e) => { if (e.key === 'Escape') setAbierta(false); };
    document.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('keydown', tecla); };
  }, [abierta]);

  const abrirNotificacion = (x) => {
    if (!x.leida) marcarNotificaciones([x.id]);
    setAbierta(false);
    if (x.tipo === 'compartir' || x.tipo === 'compartir_todo') cambiarPestana('compartidos');
  };

  const Icono = n > 0 ? BellRing : Bell;
  return (
    <>
      <button
        ref={boton}
        type="button"
        className={`campana ${n > 0 ? 'con-avisos' : ''} ${abierta ? 'abierta' : ''} ${className}`}
        onClick={() => (abierta ? setAbierta(false) : abrir())}
        title={n > 0 ? `${n} notificación(es) sin leer` : 'Notificaciones'}
        aria-label={n > 0 ? `Notificaciones: ${n} sin leer` : 'Notificaciones'}
        aria-expanded={abierta}
        style={{ color: n > 0 ? theme.accent : theme.textSecondary, backgroundColor: theme.subtleBg, borderColor: theme.border, ...estilo }}
      >
        <Icono size={tam} />
        {n > 0 && <span className="campana-numero">{n > 9 ? '9+' : n}</span>}
      </button>
      {abierta && pos && createPortal(
        <div ref={panel} className={`panel-notificaciones ${isDarkMode ? 'tema-oscuro' : ''}`} role="dialog" aria-label="Notificaciones"
          style={{ ...pos, backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
          <header style={{ borderColor: theme.border }}>
            <strong><Bell size={16} color={theme.accent} /> Notificaciones</strong>
            {n > 0 && (
              <button type="button" className="enlace-pequeno" onClick={() => marcarNotificaciones(null)} style={{ color: theme.accent }}>
                <CheckCheck size={14} /> Marcar todas como leídas
              </button>
            )}
            <button type="button" className="panel-notificaciones-cerrar" onClick={() => setAbierta(false)} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={16} /></button>
          </header>
          <div className="panel-notificaciones-lista">
            {lista.length === 0 && (
              <div className="panel-notificaciones-vacio" style={{ color: theme.textSecondary }}>
                <Inbox size={26} color={theme.accent} />
                No tienes notificaciones. Cuando alguien te comparta expedientes, te avisamos aquí.
              </div>
            )}
            {lista.map((x) => {
              const I = ICONOS[x.tipo] || Bell;
              return (
                <button key={x.id} type="button" className={`notificacion ${x.leida ? '' : 'nueva'}`} onClick={() => abrirNotificacion(x)}
                  style={{ borderColor: theme.border, backgroundColor: x.leida ? 'transparent' : `${theme.accent}0f` }}>
                  <span className="notificacion-icono" style={{ backgroundColor: `${theme.accent}1a`, color: theme.accent }}><I size={16} /></span>
                  <span className="notificacion-texto">
                    <strong style={{ color: theme.textPrimary }}>{x.titulo}</strong>
                    {x.mensaje && <span style={{ color: theme.textSecondary }}>{x.mensaje}</span>}
                    <small style={{ color: theme.textSecondary }}>{hace(x.creada_en)}{(x.tipo === 'compartir' || x.tipo === 'compartir_todo') ? ' · Ver en Compartidos conmigo' : ''}</small>
                  </span>
                  {!x.leida && <span className="notificacion-punto" style={{ backgroundColor: theme.accent }} aria-label="Sin leer" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

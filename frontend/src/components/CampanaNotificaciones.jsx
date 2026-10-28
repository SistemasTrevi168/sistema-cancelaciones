import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArchiveRestore, Bell, BellRing, Check, History, Inbox, Share2, Trash2, UserMinus, UserX, Users, X } from 'lucide-react';
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
const ICONOS = { compartir: Share2, compartir_todo: Users, quitar: UserMinus, quitar_todo: UserX };
const esQuitar = (t) => String(t).startsWith('quitar');
const tactil = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;

// Un aviso. En celular se desliza: a la derecha = leída (o regresarla), a la izquierda = quitar (o borrarla).
// En computadora: palomita para marcarla leída y equis para quitarla (pasa a «Anteriores»).
function Aviso({ x, anterior, theme, onAbrir, onLeer, onQuitar, onRestaurar, onBorrar }) {
  const [dx, setDx] = useState(0);
  const [saliendo, setSaliendo] = useState(0); // -1 / 1 mientras se va
  const [arrastrando, setArrastrando] = useState(false);
  const inicio = useRef(null);
  const deslizo = useRef(false);
  const dxRef = useRef(0);
  const I = ICONOS[x.tipo] || Bell;
  const rojo = esQuitar(x.tipo);
  const color = rojo ? '#dc2626' : theme.accent;
  const UMBRAL = 80;
  const derecha = anterior ? { texto: 'Regresar', icono: ArchiveRestore, fondo: '#2563eb' } : { texto: x.leida ? 'Leída' : 'Marcar leída', icono: Check, fondo: '#16a34a' };
  const izquierda = anterior ? { texto: 'Borrar', icono: Trash2, fondo: '#dc2626' } : { texto: 'Quitar', icono: X, fondo: '#64748b' };

  const empezar = (e) => {
    if (e.pointerType === 'mouse') return;
    inicio.current = { x: e.clientX, y: e.clientY };
    deslizo.current = false;
    dxRef.current = 0;
    setArrastrando(true);
  };
  const mover = (e) => {
    const i = inicio.current;
    if (!i) return;
    const mx = e.clientX - i.x;
    if (!deslizo.current && Math.abs(e.clientY - i.y) > Math.abs(mx) && Math.abs(e.clientY - i.y) > 6) { inicio.current = null; setArrastrando(false); return; } // es scroll
    if (Math.abs(mx) > 8) deslizo.current = true;
    if (deslizo.current) { dxRef.current = Math.max(-160, Math.min(160, mx)); setDx(dxRef.current); }
  };
  const soltar = () => {
    setArrastrando(false);
    if (!inicio.current) return;
    inicio.current = null;
    const dx = dxRef.current;
    dxRef.current = 0;
    if (dx > UMBRAL) {
      if (anterior) { setSaliendo(1); setTimeout(() => onRestaurar(x), 180); } else { onLeer(x); }
    } else if (dx < -UMBRAL) {
      setSaliendo(-1);
      setTimeout(() => (anterior ? onBorrar(x) : onQuitar(x)), 180);
    }
    setDx(0);
  };
  const fondo = dx > 0 ? derecha : izquierda;
  const IF = fondo.icono;
  const desplazamiento = saliendo ? `${saliendo * 110}%` : `${dx}px`;

  return (
    <div className={`aviso ${saliendo ? 'saliendo' : ''}`}>
      {dx !== 0 && (
        <div className={`aviso-fondo ${dx > 0 ? 'derecha' : 'izquierda'} ${Math.abs(dx) > UMBRAL ? 'listo' : ''}`} style={{ backgroundColor: fondo.fondo }}>
          <IF size={16} /> {fondo.texto}
        </div>
      )}
      <div
        className={`aviso-cuerpo ${x.leida ? '' : 'nuevo'} ${rojo ? '' : 'con-enlace'}`}
        role={rojo ? undefined : 'button'} tabIndex={0}
        onPointerDown={empezar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
        onClick={() => { if (deslizo.current) { deslizo.current = false; return; } onAbrir(x); }}
        onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(x); }}
        style={{ transform: `translateX(${desplazamiento})`, transition: arrastrando ? 'none' : 'transform .2s ease', backgroundColor: theme.cardBg }}
      >
        {!x.leida && <span className="aviso-punto" style={{ backgroundColor: theme.accent }} aria-label="Sin leer" />}
        <span className="aviso-icono" style={{ backgroundColor: `${color}17`, color }}><I size={14} /></span>
        <span className="aviso-texto">
          <strong style={{ color: theme.textPrimary }}>{x.titulo}</strong>
          <small style={{ color: theme.textSecondary }}>{x.mensaje ? `${x.mensaje} · ` : ''}{hace(x.creada_en)}</small>
        </span>
        <span className="aviso-botones">
          {anterior ? (
            <>
              <button type="button" title="Regresar a Recientes" aria-label="Regresar a Recientes" onClick={(e) => { e.stopPropagation(); onRestaurar(x); }} style={{ color: theme.textSecondary }}><ArchiveRestore size={14} /></button>
              <button type="button" title="Borrar" aria-label="Borrar" onClick={(e) => { e.stopPropagation(); onBorrar(x); }} style={{ color: '#dc2626' }}><Trash2 size={14} /></button>
            </>
          ) : (
            <>
              {!x.leida && <button type="button" title="Marcar como leída" aria-label="Marcar como leída" onClick={(e) => { e.stopPropagation(); onLeer(x); }} style={{ color: '#16a34a' }}><Check size={15} /></button>}
              <button type="button" title="Quitar (pasa a Anteriores)" aria-label="Quitar" onClick={(e) => { e.stopPropagation(); onQuitar(x); }} style={{ color: theme.textSecondary }}><X size={15} /></button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// Campana con el número de avisos sin leer; al abrirla se ve la lista (p. ej. «Ana te compartió 3 expedientes»)
export default function CampanaNotificaciones({ className = '', tam = 18, estilo = {} }) {
  const { theme, isDarkMode, notificaciones, marcarNotificaciones, archivarNotificaciones, restaurarNotificaciones, borrarNotificaciones, irACompartidos } = useApp();
  const [vista, setVista] = useState('nuevas'); // nuevas / anteriores
  const [abierta, setAbierta] = useState(false);
  const [pos, setPos] = useState(null);
  const boton = useRef(null);
  const panel = useRef(null);
  const n = notificaciones?.no_leidas || 0;
  const lista = notificaciones?.lista || [];
  const anteriores = notificaciones?.anteriores || [];

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(350, window.innerWidth - 24);
    // Junto al menú lateral se abre a la derecha; en celular, hacia abajo
    const lateral = r.left < 320 && window.innerWidth > 860;
    setPos(lateral
      ? { left: r.right + 14, bottom: Math.max(12, window.innerHeight - r.bottom - 8), width: ancho }
      : { top: r.bottom + 8, left: Math.max(12, Math.min(r.right - ancho, window.innerWidth - ancho - 12)), width: ancho });
    setVista('nuevas');
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
    if (esQuitar(x.tipo)) return; // solo es un aviso: ya no hay nada que abrir
    setAbierta(false);
    irACompartidos();
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
            <strong>Notificaciones</strong>
            {vista === 'nuevas' && n > 0 && (
              <button type="button" className="enlace-pequeno" onClick={() => marcarNotificaciones(null)} style={{ color: theme.accent }}>Leer todas</button>
            )}
            {vista === 'anteriores' && anteriores.length > 0 && (
              <button type="button" className="enlace-pequeno" onClick={() => borrarNotificaciones(null)} style={{ color: '#dc2626' }}>Vaciar</button>
            )}
            <button type="button" className="panel-notificaciones-cerrar" onClick={() => setAbierta(false)} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={16} /></button>
          </header>
          <div className="notificaciones-segmento" role="tablist" style={{ backgroundColor: theme.subtleBg }}>
            <button type="button" role="tab" aria-selected={vista === 'nuevas'} onClick={() => setVista('nuevas')}
              style={vista === 'nuevas' ? { backgroundColor: theme.cardBg, color: theme.textPrimary } : { color: theme.textSecondary }}>
              Recientes{lista.length > 0 ? ` · ${lista.length}` : ''}
            </button>
            <button type="button" role="tab" aria-selected={vista === 'anteriores'} onClick={() => setVista('anteriores')}
              style={vista === 'anteriores' ? { backgroundColor: theme.cardBg, color: theme.textPrimary } : { color: theme.textSecondary }}>
              <History size={12} /> Anteriores{anteriores.length > 0 ? ` · ${anteriores.length}` : ''}
            </button>
          </div>
          <div className="panel-notificaciones-lista">
            {(vista === 'nuevas' ? lista : anteriores).length === 0 && (
              <div className="panel-notificaciones-vacio" style={{ color: theme.textSecondary }}>
                {vista === 'nuevas' ? <Inbox size={22} color={theme.accent} /> : <History size={22} color={theme.accent} />}
                {vista === 'nuevas' ? 'Sin notificaciones nuevas.' : 'Aquí quedan las que quites de la lista.'}
              </div>
            )}
            {(vista === 'nuevas' ? lista : anteriores).map((x) => (
              <Aviso key={x.id} x={x} anterior={vista === 'anteriores'} theme={theme}
                onAbrir={abrirNotificacion}
                onLeer={(a) => marcarNotificaciones([a.id])}
                onQuitar={(a) => archivarNotificaciones([a.id])}
                onRestaurar={(a) => restaurarNotificaciones([a.id])}
                onBorrar={(a) => borrarNotificaciones([a.id])} />
            ))}
          </div>
          {tactil() && (vista === 'nuevas' ? lista : anteriores).length > 0 && (
            <p className="notificaciones-pista" style={{ color: theme.textSecondary, borderColor: theme.border }}>
              {vista === 'nuevas' ? 'Desliza → para marcar leída · ← para quitar' : 'Desliza → para regresar · ← para borrar'}
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

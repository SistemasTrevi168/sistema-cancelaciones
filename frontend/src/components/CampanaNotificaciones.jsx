import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArchiveRestore, Bell, BellRing, Check, Inbox, MessageCircle, Share2, Trash2, UserMinus, UserX, Users, X } from 'lucide-react';
import { useApp } from '../AppContext';
import ErrorBoundary from './ErrorBoundary';

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
const ICONOS = { compartir: Share2, compartir_todo: Users, quitar: UserMinus, quitar_todo: UserX, comentario: MessageCircle };
const esQuitar = (t) => String(t).startsWith('quitar');
const tactil = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;

// Un aviso. En celular se desliza: a la derecha = leída (o regresarla), a la izquierda = quitar (o borrarla).
// En computadora: palomita para marcarla leída y equis para quitarla (pasa a «Anteriores»).
// El deslizado mueve el elemento directo (sin volver a dibujar React en cada movimiento) para que sea fluido.
const UMBRAL = 72;
function Aviso({ x, modo, theme, onAbrir, onLeer, onQuitar, onRestaurar, onBorrar }) {
  const anterior = modo === 'borrada';
  const cuerpo = useRef(null);
  const fondo = useRef(null);
  const caja = useRef(null);
  const gesto = useRef(null); // { x, y, dx, activo, paso }
  const deslizo = useRef(false);
  const I = ICONOS[x.tipo] || Bell;
  const rojo = esQuitar(x.tipo);
  const color = rojo ? '#dc2626' : theme.accent;
  // Recibida: → leída · ← quitar.  Leída: ← quitar.  Borrada: → regresar · ← borrar para siempre
  const derecha = anterior ? { texto: 'Regresar', icono: ArchiveRestore, fondo: '#2563eb' } : (modo === 'recibida' ? { texto: 'Leída', icono: Check, fondo: '#16a34a' } : null);
  const izquierda = anterior ? { texto: 'Borrar', icono: Trash2, fondo: '#dc2626' } : { texto: 'Quitar', icono: X, fondo: '#64748b' };

  const pintar = (dx) => {
    const c = cuerpo.current;
    const f = fondo.current;
    if (!c || !f) return;
    c.style.transform = `translate3d(${dx}px, 0, 0)`;
    f.style.opacity = dx === 0 ? '0' : '1';
    f.dataset.lado = dx > 0 ? 'derecha' : 'izquierda';
    f.dataset.listo = Math.abs(dx) > UMBRAL ? 'si' : 'no';
  };
  const animar = (destino, alTerminar) => {
    const c = cuerpo.current;
    if (!c) return;
    c.style.transition = 'transform .22s cubic-bezier(.2, .8, .2, 1)';
    pintar(destino);
    const fin = () => { c.removeEventListener('transitionend', fin); c.style.transition = ''; alTerminar?.(); };
    c.addEventListener('transitionend', fin);
    setTimeout(fin, 260);
  };
  const irse = (lado, accion) => {
    const ancho = caja.current?.offsetWidth || 320;
    animar(lado * (ancho + 20), () => {
      const k = caja.current;
      if (k) { k.style.height = `${k.offsetHeight}px`; requestAnimationFrame(() => { k.classList.add('saliendo'); k.style.height = '0px'; }); }
      setTimeout(accion, 200);
    });
  };

  const empezar = (e) => {
    if (e.pointerType === 'mouse') return;
    gesto.current = { x: e.clientX, y: e.clientY, dx: 0, activo: false, paso: false };
    deslizo.current = false;
    if (cuerpo.current) cuerpo.current.style.transition = '';
  };
  const mover = (e) => {
    const g = gesto.current;
    if (!g) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    if (!g.activo) {
      if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) { gesto.current = null; return; } // es scroll de la lista
      if (Math.abs(mx) < 8) return;
      g.activo = true;
      deslizo.current = true;
      try { cuerpo.current?.setPointerCapture?.(e.pointerId); } catch { /* sin captura */ }
    }
    // Más allá del umbral cuesta un poco más (se siente como resorte); hacia donde no hay acción casi no se mueve
    const extra = Math.max(0, Math.abs(mx) - UMBRAL);
    if (mx > 0 && !derecha) { g.dx = Math.min(mx * 0.25, 24); requestAnimationFrame(() => pintar(g.dx)); return; }
    g.dx = Math.sign(mx) * (Math.min(Math.abs(mx), UMBRAL) + extra * 0.55);
    const paso = Math.abs(g.dx) > UMBRAL;
    if (paso !== g.paso) { g.paso = paso; if (paso) navigator.vibrate?.(8); }
    requestAnimationFrame(() => pintar(g.dx));
  };
  const soltar = () => {
    const g = gesto.current;
    gesto.current = null;
    if (!g || !g.activo) return;
    if (g.dx > UMBRAL && derecha) {
      irse(1, () => (anterior ? onRestaurar(x) : onLeer(x)));
    } else if (g.dx < -UMBRAL) {
      irse(-1, () => (anterior ? onBorrar(x) : onQuitar(x)));
    } else {
      animar(0);
    }
  };
  const ID = derecha?.icono || Check;
  const II = izquierda.icono;

  return (
    <div ref={caja} className="aviso">
      <div ref={fondo} className="aviso-fondo" data-lado="izquierda" data-listo="no" style={{ opacity: 0 }}>
        {derecha && <span className="aviso-fondo-der" style={{ backgroundColor: derecha.fondo }}><ID size={16} /> {derecha.texto}</span>}
        <span className="aviso-fondo-izq" style={{ backgroundColor: izquierda.fondo }}>{izquierda.texto} <II size={16} /></span>
      </div>
      <div
        ref={cuerpo}
        className={`aviso-cuerpo ${x.leida ? '' : 'nuevo'} ${rojo ? '' : 'con-enlace'}`}
        role={rojo ? undefined : 'button'} tabIndex={0}
        onPointerDown={empezar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
        onClick={() => { if (deslizo.current) { deslizo.current = false; return; } onAbrir(x); }}
        onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(x); }}
        style={{ backgroundColor: theme.cardBg }}
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
              <button type="button" title="Regresar a Leídas" aria-label="Regresar a Leídas" onClick={(e) => { e.stopPropagation(); irse(1, () => onRestaurar(x)); }} style={{ color: theme.textSecondary }}><ArchiveRestore size={14} /></button>
              <button type="button" title="Borrar para siempre" aria-label="Borrar para siempre" onClick={(e) => { e.stopPropagation(); irse(-1, () => onBorrar(x)); }} style={{ color: '#dc2626' }}><Trash2 size={14} /></button>
            </>
          ) : (
            <>
              {modo === 'recibida' && <button type="button" title="Marcar como leída (pasa a Leídas)" aria-label="Marcar como leída" onClick={(e) => { e.stopPropagation(); irse(1, () => onLeer(x)); }} style={{ color: '#16a34a' }}><Check size={15} /></button>}
              <button type="button" title="Quitar (pasa a Borradas)" aria-label="Quitar" onClick={(e) => { e.stopPropagation(); irse(-1, () => onQuitar(x)); }} style={{ color: theme.textSecondary }}><X size={15} /></button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// Campana con el número de avisos sin leer; al abrirla se ve la lista (p. ej. «Ana te compartió 3 expedientes»)
export default function CampanaNotificaciones({ className = '', tam = 18, estilo = {} }) {
  const { theme, isDarkMode, notificaciones, marcarNotificaciones, archivarNotificaciones, restaurarNotificaciones, borrarNotificaciones, irACompartidos, irAComentarios } = useApp();
  const [vista, setVista] = useState('recibidas'); // recibidas / leidas / borradas
  const [abierta, setAbierta] = useState(false);
  const [pos, setPos] = useState(null);
  const boton = useRef(null);
  const panel = useRef(null);
  const n = notificaciones?.no_leidas || 0;
  const lista = notificaciones?.lista || [];
  const anteriores = notificaciones?.anteriores || [];
  const recibidas = lista.filter((x) => !x.leida);
  const leidas = lista.filter((x) => x.leida);
  const VISTAS = {
    recibidas: { titulo: 'Recibidas', items: recibidas, modo: 'recibida', icono: Inbox, vacio: 'No tienes notificaciones nuevas.', pista: 'Desliza → para marcar leída · ← para quitar' },
    leidas: { titulo: 'Leídas', items: leidas, modo: 'leida', icono: Check, vacio: 'Aquí quedan las que ya leíste.', pista: 'Desliza ← para quitar' },
    borradas: { titulo: 'Borradas', items: anteriores, modo: 'borrada', icono: Trash2, vacio: 'Aquí quedan las que quites. Desde aquí se borran para siempre.', pista: 'Desliza → para regresar · ← para borrar' },
  };
  const actual = VISTAS[vista] || VISTAS.recibidas;

  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(350, window.innerWidth - 24);
    // Junto al menú lateral se abre a la derecha; en celular, hacia abajo
    const lateral = r.left < 320 && window.innerWidth > 860;
    setPos(lateral
      ? { left: r.right + 14, bottom: Math.max(12, window.innerHeight - r.bottom - 8), width: ancho }
      : { top: r.bottom + 8, left: Math.max(12, Math.min(r.right - ancho, window.innerWidth - ancho - 12)), width: ancho });
    setVista('recibidas');
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
    if (x.tipo === 'comentario') irAComentarios(x.datos);
    else irACompartidos();
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
        <ErrorBoundary nombre="notificaciones" silencioso>
        <div ref={panel} className={`panel-notificaciones ${isDarkMode ? 'tema-oscuro' : ''}`} role="dialog" aria-label="Notificaciones"
          style={{ ...pos, backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
          <header style={{ borderColor: theme.border }}>
            <strong>Notificaciones</strong>
            {vista === 'recibidas' && recibidas.length > 0 && (
              <button type="button" className="enlace-pequeno" onClick={() => marcarNotificaciones(null)} style={{ color: theme.accent }}>Leer todas</button>
            )}
            {vista === 'borradas' && anteriores.length > 0 && (
              <button type="button" className="enlace-pequeno" onClick={() => borrarNotificaciones(null)} style={{ color: '#dc2626' }}>Vaciar</button>
            )}
            <button type="button" className="panel-notificaciones-cerrar" onClick={() => setAbierta(false)} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={16} /></button>
          </header>
          <div className="notificaciones-segmento" role="tablist" style={{ backgroundColor: theme.subtleBg }}>
            {Object.entries(VISTAS).map(([id, v]) => (
              <button key={id} type="button" role="tab" aria-selected={vista === id} onClick={() => setVista(id)}
                style={vista === id ? { backgroundColor: theme.cardBg, color: theme.textPrimary } : { color: theme.textSecondary }}>
                {v.titulo}{v.items.length > 0 && <span className={`segmento-n ${id === 'recibidas' ? 'nuevas' : ''}`}>{v.items.length}</span>}
              </button>
            ))}
          </div>
          <div className="panel-notificaciones-lista">
            {actual.items.length === 0 && (
              <div className="panel-notificaciones-vacio" style={{ color: theme.textSecondary }}>
                <actual.icono size={22} color={theme.accent} />
                {actual.vacio}
              </div>
            )}
            {actual.items.map((x) => (
              <Aviso key={`${vista}-${x.id}`} x={x} modo={actual.modo} theme={theme}
                onAbrir={abrirNotificacion}
                onLeer={(a) => marcarNotificaciones([a.id])}
                onQuitar={(a) => archivarNotificaciones([a.id])}
                onRestaurar={(a) => restaurarNotificaciones([a.id])}
                onBorrar={(a) => borrarNotificaciones([a.id])} />
            ))}
          </div>
          {tactil() && actual.items.length > 0 && (
            <p className="notificaciones-pista" style={{ color: theme.textSecondary, borderColor: theme.border }}>{actual.pista}</p>
          )}
        </div>
        </ErrorBoundary>,
        document.body,
      )}
    </>
  );
}

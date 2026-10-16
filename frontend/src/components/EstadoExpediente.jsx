import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useApp } from '../AppContext';
import usePresencia from '../ui/usarPresencia';
import { ESTADOS, colorEstado, infoEstado } from '../estadosExpediente';

// Chip del estado; al tocarlo se despliega el menú para cambiarlo
export default function EstadoExpediente({ id, estado, compacto = false }) {
  const { theme, isDarkMode, cambiarEstado } = useApp();
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const [cambiando, setCambiando] = useState(false);
  const boton = useRef(null);
  const menu = useRef(null);
  const { montado, saliendo } = usePresencia(abierto, 140);
  const info = infoEstado(estado);
  const Icono = info.icono;

  const abrir = () => {
    const r = boton.current.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom > 200;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 240)), ...(abajo ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }), arriba: !abajo });
    setAbierto(true);
  };
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!menu.current?.contains(e.target) && !boton.current?.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus(); } };
    const cerrar = () => setAbierto(false);
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', cerrar, true);
    return () => { document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('keydown', tecla); window.removeEventListener('scroll', cerrar, true); };
  }, [abierto]);

  const elegir = async (nuevo) => {
    setAbierto(false);
    if (nuevo === estado) return;
    setCambiando(true);
    await cambiarEstado(id, nuevo);
    setCambiando(false);
  };

  return (
    <>
      <button
        ref={boton}
        type="button"
        className={`chip-estado ${compacto ? 'compacto' : ''} ${cambiando ? 'cambiando' : ''}`}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Cambiar el estado"
        style={colorEstado(estado, isDarkMode)}
        data-sin-onda
      >
        <Icono size={13} /> {info.nombre} <ChevronDown size={12} className="chip-estado-flecha" />
      </button>
      {montado && pos && createPortal(
        <div ref={menu} role="menu" className={`menu-estado ${pos.arriba ? 'hacia-arriba' : ''} ${saliendo ? 'saliendo' : ''}`}
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
          {ESTADOS.map((e, i) => {
            const I = e.icono;
            const c = colorEstado(e.id, isDarkMode);
            return (
              <button key={e.id} type="button" role="menuitemradio" aria-checked={e.id === estado} className="menu-estado-opcion"
                style={{ animationDelay: `${i * 30}ms` }} onClick={() => elegir(e.id)} data-sin-onda>
                <span className="menu-estado-icono" style={{ backgroundColor: c.backgroundColor, color: c.color }}><I size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{e.nombre}</strong>
                  <small style={{ color: theme.textSecondary }}>{e.detalle}</small>
                </span>
                {e.id === estado && <Check size={15} color={theme.accent} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

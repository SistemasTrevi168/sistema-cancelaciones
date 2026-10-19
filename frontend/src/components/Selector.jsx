import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useApp } from '../AppContext';

// Lista desplegable con animación. Se usa igual que un <select> (mismos <option> y <optgroup>).
// - En computadora: lista propia que se despliega con animación (teclado: flechas, Enter, Esc, letras).
// - En celular / tablet: se abre el selector nativo del teléfono (el de iPhone es más cómodo).
// Por dentro siempre hay un <select> real (invisible) con el mismo id, para formularios y accesibilidad.

const textoDe = (nodo) => Children.toArray(nodo).map((n) => (typeof n === 'string' || typeof n === 'number' ? String(n) : (isValidElement(n) ? textoDe(n.props.children) : ''))).join('');

function leerOpciones(children) {
  const lista = [];
  const recorrer = (nodos, grupo) => {
    Children.forEach(nodos, (n) => {
      if (!isValidElement(n)) return;
      if (n.type === 'option') {
        lista.push({ valor: String(n.props.value ?? textoDe(n.props.children)), etiqueta: textoDe(n.props.children), deshabilitada: !!n.props.disabled, grupo });
      } else if (n.type === 'optgroup') {
        lista.push({ encabezado: true, etiqueta: n.props.label });
        recorrer(n.props.children, n.props.label);
      } else if (typeof n.type === 'symbol') {
        recorrer(n.props.children, grupo);
      } else if (typeof n.type === 'function') {
        // Componentes que solo regresan opciones (ej. <OpcionesPlantilla />)
        recorrer(n.type(n.props), grupo);
      }
    });
  };
  recorrer(children);
  return lista;
}

const esTactil = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none), (pointer: coarse)').matches;

export default function Selector({
  id, value, onChange, disabled = false, className = '', style, title, children, 'aria-label': ariaLabel, ...resto
}) {
  const { theme, isDarkMode } = useApp();
  const idLista = useId();
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [activo, setActivo] = useState(-1);
  // Solo se desplaza la lista para mostrar la opción activa cuando se usa el teclado (o al abrir),
  // no cuando se pasa el mouse: si no, la lista se mueve sola debajo del cursor y el clic cae en otra opción.
  const porTeclado = useRef(true);
  const [posicion, setPosicion] = useState(null);
  const raiz = useRef(null);
  const boton = useRef(null);
  const lista = useRef(null);
  const busqueda = useRef({ texto: '', t: 0 });
  const tactil = useMemo(() => esTactil(), []);

  const opciones = useMemo(() => leerOpciones(children), [children]);
  const elegida = opciones.find((o) => !o.encabezado && o.valor === String(value ?? ''));
  const etiqueta = elegida?.etiqueta ?? opciones.find((o) => !o.encabezado)?.etiqueta ?? '';
  const elegibles = opciones.map((o, i) => (!o.encabezado && !o.deshabilitada ? i : -1)).filter((i) => i >= 0);

  const cerrar = (volverFoco = true) => {
    if (!abierto) return;
    setSaliendo(true);
    setTimeout(() => { setAbierto(false); setSaliendo(false); }, 130);
    if (volverFoco) boton.current?.focus();
  };
  const abrir = () => {
    if (disabled || tactil) return;
    const i = opciones.findIndex((o) => !o.encabezado && o.valor === String(value ?? ''));
    porTeclado.current = true;
    setActivo(i >= 0 && !opciones[i].deshabilitada ? i : (elegibles[0] ?? -1));
    setSaliendo(false);
    setAbierto(true);
  };
  const elegir = (i) => {
    const o = opciones[i];
    if (!o || o.encabezado || o.deshabilitada) return;
    if (o.valor !== String(value ?? '')) onChange?.({ target: { value: o.valor, id }, currentTarget: { value: o.valor, id } });
    cerrar();
  };

  // Posición de la lista (abajo del botón; arriba si no cabe)
  useLayoutEffect(() => {
    if (!abierto) return undefined;
    const calcular = () => {
      const r = raiz.current?.getBoundingClientRect();
      if (!r) return;
      const abajo = window.innerHeight - r.bottom - 12;
      const arriba = r.top - 12;
      const haciaArriba = abajo < 220 && arriba > abajo;
      const alto = Math.min(340, Math.max(140, haciaArriba ? arriba : abajo));
      const ancho = Math.max(r.width, 200);
      setPosicion({
        left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
        width: ancho,
        maxHeight: alto,
        ...(haciaArriba ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        haciaArriba,
      });
    };
    calcular();
    // Al desplazar la página se recoloca; al desplazar la propia lista, no (si no, regresaba sola a la opción elegida)
    const alDesplazar = (e) => { if (!lista.current || !lista.current.contains(e.target)) calcular(); };
    window.addEventListener('resize', calcular);
    window.addEventListener('scroll', alDesplazar, true);
    return () => { window.removeEventListener('resize', calcular); window.removeEventListener('scroll', alDesplazar, true); };
  }, [abierto]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (raiz.current?.contains(e.target) || lista.current?.contains(e.target)) return;
      cerrar(false);
    };
    document.addEventListener('pointerdown', fuera, true);
    return () => document.removeEventListener('pointerdown', fuera, true);
  });

  const colocada = !!posicion;
  // La opción activa siempre a la vista
  useEffect(() => {
    if (!abierto || activo < 0 || !porTeclado.current) return;
    lista.current?.querySelector(`[data-indice="${activo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [abierto, activo, colocada]);

  const mover = (paso) => {
    if (!elegibles.length) return;
    const pos = elegibles.indexOf(activo);
    const sig = pos < 0 ? (paso > 0 ? 0 : elegibles.length - 1) : Math.max(0, Math.min(elegibles.length - 1, pos + paso));
    setActivo(elegibles[sig]);
  };
  const alTeclear = (e) => {
    if (disabled) return;
    porTeclado.current = true;
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); abrir(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActivo(elegibles[0]); }
    else if (e.key === 'End') { e.preventDefault(); setActivo(elegibles[elegibles.length - 1]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(activo); }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    else if (e.key === 'Tab') { cerrar(false); }
    else if (e.key.length === 1) {
      // Buscar escribiendo las primeras letras
      const ahora = Date.now();
      busqueda.current = { texto: (ahora - busqueda.current.t < 700 ? busqueda.current.texto : '') + e.key.toLowerCase(), t: ahora };
      const i = elegibles.find((k) => opciones[k].etiqueta.toLowerCase().includes(busqueda.current.texto));
      if (i !== undefined) setActivo(i);
    }
  };

  const fondoActivo = isDarkMode ? 'rgba(148,163,184,.16)' : 'rgba(15,23,42,.06)';

  return (
    <div
      ref={raiz}
      className={`selector ${className} ${abierto && !saliendo ? 'abierto' : ''} ${disabled ? 'deshabilitado' : ''} ${tactil ? 'tactil' : ''}`}
      style={style}
      title={title}
      onClick={() => { if (!tactil) (abierto ? cerrar() : abrir()); }}
    >
      <button
        ref={boton}
        type="button"
        className="selector-boton"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-label={ariaLabel || title || undefined}
        aria-activedescendant={abierto && activo >= 0 ? `${idLista}-${activo}` : undefined}
        onKeyDown={alTeclear}
        tabIndex={tactil ? -1 : 0}
        data-sin-onda
      >
        <span className="selector-texto">{etiqueta}</span>
        <ChevronDown size={14} className="selector-flecha" aria-hidden="true" />
      </button>
      {/* El <select> real: invisible; en celular es el que se toca (abre el selector del teléfono) */}
      <select
        {...resto}
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel || title || undefined}
        className="selector-nativo"
        tabIndex={tactil ? 0 : -1}
        aria-hidden={tactil ? undefined : true}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </select>

      {abierto && posicion && createPortal(
        <div
          ref={lista}
          id={idLista}
          role="listbox"
          onClick={(e) => e.stopPropagation()}
          className={`selector-lista ${posicion.haciaArriba ? 'hacia-arriba' : ''} ${saliendo ? 'saliendo' : ''}`}
          style={{
            left: posicion.left, top: posicion.top, bottom: posicion.bottom, minWidth: posicion.width, maxWidth: Math.max(posicion.width, 360),
            maxHeight: posicion.maxHeight, backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary,
          }}
        >
          {opciones.map((o, i) => (o.encabezado ? (
            <div key={`g-${i}`} className="selector-grupo" style={{ color: theme.textSecondary }}>{o.etiqueta}</div>
          ) : (
            <div
              key={`${o.valor}-${i}`}
              id={`${idLista}-${i}`}
              data-indice={i}
              role="option"
              aria-selected={elegida === o}
              aria-disabled={o.deshabilitada || undefined}
              className={`selector-opcion ${elegida === o ? 'elegida' : ''} ${o.deshabilitada ? 'deshabilitada' : ''}`}
              style={{
                animationDelay: `${Math.min(i, 12) * 12}ms`,
                backgroundColor: i === activo ? fondoActivo : undefined,
                color: elegida === o ? theme.accent : undefined,
              }}
              onPointerMove={() => { if (!o.deshabilitada && activo !== i) { porTeclado.current = false; setActivo(i); } }}
              onClick={(e) => { e.stopPropagation(); elegir(i); }}
            >
              <span>{o.etiqueta}</span>
              {elegida === o && <Check size={14} />}
            </div>
          )))}
        </div>,
        document.body,
      )}
    </div>
  );
}

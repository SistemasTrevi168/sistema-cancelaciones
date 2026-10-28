import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, RotateCw, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useApp } from '../AppContext';

const VISTA = 280;   // tamaño del recuadro en pantalla
const SALIDA = 320;  // tamaño de la foto que se guarda (px)

// Ventana para acomodar y recortar la foto de perfil: arrastrar, acercar, girar.
export default function RecortarFoto({ archivo, onCancelar, onListo }) {
  const { theme } = useApp();
  const lienzoRef = useRef(null);
  const [imagen, setImagen] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [guardando, setGuardando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const arrastre = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => setImagen(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  // Escala para que la imagen cubra todo el recuadro
  const medidas = useCallback(() => {
    if (!imagen) return null;
    const girada = giro % 180 !== 0;
    const w = girada ? imagen.height : imagen.width;
    const h = girada ? imagen.width : imagen.height;
    const base = Math.max(VISTA / w, VISTA / h);
    return { w, h, escala: base * zoom };
  }, [imagen, giro, zoom]);

  // La imagen no puede dejar huecos dentro del recuadro
  const limitar = useCallback((p) => {
    const m = medidas();
    if (!m) return p;
    const maxX = Math.max(0, (m.w * m.escala - VISTA) / 2);
    const maxY = Math.max(0, (m.h * m.escala - VISTA) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  }, [medidas]);

  const dibujar = useCallback((ctx, tam) => {
    const m = medidas();
    if (!m) return;
    const f = tam / VISTA;
    const p = limitar(pos); // al cambiar zoom o giro la posición se ajusta sola
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tam, tam);
    ctx.translate(tam / 2 + p.x * f, tam / 2 + p.y * f);
    ctx.rotate((giro * Math.PI) / 180);
    const s = m.escala * f;
    ctx.drawImage(imagen, (-imagen.width * s) / 2, (-imagen.height * s) / 2, imagen.width * s, imagen.height * s);
    ctx.restore();
  }, [imagen, medidas, limitar, pos, giro]);

  useEffect(() => {
    const lienzo = lienzoRef.current;
    if (!lienzo || !imagen) return;
    const dpr = window.devicePixelRatio || 1;
    lienzo.width = VISTA * dpr;
    lienzo.height = VISTA * dpr;
    dibujar(lienzo.getContext('2d'), VISTA * dpr);
  }, [imagen, dibujar]);


  const alPresionar = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, inicio: limitar(pos) };
    setArrastrando(true);
  };
  const alMover = (e) => {
    if (!arrastre.current) return;
    const { x, y, inicio } = arrastre.current;
    setPos(limitar({ x: inicio.x + (e.clientX - x), y: inicio.y + (e.clientY - y) }));
  };
  const alSoltar = () => { arrastre.current = null; setArrastrando(false); };
  const alTeclear = (e) => {
    const paso = e.shiftKey ? 20 : 6;
    const mover = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
    if (mover) { e.preventDefault(); setPos((p) => { const q = limitar(p); return limitar({ x: q.x + mover[0], y: q.y + mover[1] }); }); }
    if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.1));
    if (e.key === '-') setZoom((z) => Math.max(1, z - 0.1));
    if (e.key === 'Escape') onCancelar();
  };

  useEffect(() => {
    const lienzo = lienzoRef.current;
    if (!lienzo) return undefined;
    const alRueda = (e) => {
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.0015)));
    };
    lienzo.addEventListener('wheel', alRueda, { passive: false });
    return () => lienzo.removeEventListener('wheel', alRueda);
  }, []);

  const listo = () => {
    setGuardando(true);
    const c = document.createElement('canvas');
    c.width = SALIDA;
    c.height = SALIDA;
    dibujar(c.getContext('2d'), SALIDA);
    onListo(c.toDataURL('image/jpeg', 0.88));
  };

  const boton = { backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border };
  // Se dibuja directo en <body> para que siempre quede a la vista (también en celular)
  return createPortal(
    <div className="fondo-modal" role="dialog" aria-modal="true" aria-label="Recortar foto" onKeyDown={alTeclear}>
      <div className="recortar-foto" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
        <header>
          <h3>Acomoda tu foto</h3>
          <button type="button" className="boton-icono" onClick={onCancelar} aria-label="Cancelar" style={{ color: theme.textSecondary }}><X size={18} /></button>
        </header>
        <p style={{ color: theme.textSecondary }}>Arrastra para moverla y usa el control (o la rueda del mouse) para acercarla. Lo que queda dentro del círculo es tu foto.</p>
        <div className="recortar-area" style={{ width: VISTA, height: VISTA }}>
          {!imagen && <div className="recortar-cargando"><Loader2 size={20} className="girando" /></div>}
          <canvas
            ref={lienzoRef}
            tabIndex={0}
            aria-label="Vista de la foto. Usa las flechas para moverla y + o − para acercarla."
            style={{ width: VISTA, height: VISTA, cursor: arrastrando ? 'grabbing' : 'grab' }}
            onPointerDown={alPresionar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
          />
          <div className="recortar-mascara" aria-hidden="true" />
        </div>
        <div className="recortar-controles">
          <button type="button" className="boton-icono" onClick={() => setZoom((z) => Math.max(1, z - 0.2))} aria-label="Alejar" style={{ color: theme.textSecondary }}><ZoomOut size={16} /></button>
          <input id="recortar-zoom" type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Acercar" style={{ accentColor: theme.accent }} />
          <button type="button" className="boton-icono" onClick={() => setZoom((z) => Math.min(4, z + 0.2))} aria-label="Acercar" style={{ color: theme.textSecondary }}><ZoomIn size={16} /></button>
        </div>
        <div className="recortar-acciones">
          <button type="button" className="boton-barra" onClick={() => setGiro((g) => (g + 90) % 360)} style={boton}><RotateCw size={14} /> Girar</button>
          <button type="button" className="boton-barra" onClick={() => { setZoom(1); setGiro(0); setPos({ x: 0, y: 0 }); }} style={boton}><Undo2 size={14} /> Restablecer</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="boton-barra" onClick={onCancelar} style={boton}>Cancelar</button>
          <button type="button" className="boton-barra boton-primario" onClick={listo} disabled={!imagen || guardando} style={{ backgroundColor: theme.accent, borderColor: theme.accent, color: '#fff' }}>
            {guardando ? <Loader2 size={14} className="girando" /> : <Check size={14} />} Usar esta foto
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../ui/pdf';

// Una página del PDF: imagen + capa de texto seleccionable + (opcional) recuadro para OCR
export default function PaginaPdf({ pdf, numero, escala, ancho, alto, modoOcr, onAreaOcr, registrar }) {
  const contenedorRef = useRef(null);
  const canvasRef = useRef(null);
  const textoRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [recuadro, setRecuadro] = useState(null);
  const inicio = useRef(null);

  useEffect(() => { registrar?.(numero, contenedorRef.current); }, [numero, registrar]);

  // Solo se dibujan las páginas cercanas a la vista (documentos de 100+ hojas)
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { rootMargin: '800px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !pdf) return;
    let cancelado = false;
    let tarea = null;
    let capa = null;
    (async () => {
      const pagina = await pdf.getPage(numero);
      if (cancelado) return;
      const viewport = pagina.getViewport({ scale: escala });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      tarea = pagina.render({ canvasContext: ctx, viewport });
      try { await tarea.promise; } catch { return; }
      if (cancelado) return;
      const contenido = await pagina.getTextContent();
      if (cancelado || !textoRef.current) return;
      textoRef.current.replaceChildren();
      textoRef.current.style.setProperty('--scale-factor', String(viewport.scale));
      capa = new pdfjsLib.TextLayer({ textContentSource: contenido, container: textoRef.current, viewport });
      try { await capa.render(); } catch { /* página sin texto */ }
    })();
    return () => {
      cancelado = true;
      tarea?.cancel?.();
      capa?.cancel?.();
    };
  }, [visible, pdf, numero, escala]);

  // ---- Recuadro para OCR ----
  const posicion = (e) => {
    const r = contenedorRef.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(e.clientX - r.left, r.width)), y: Math.max(0, Math.min(e.clientY - r.top, r.height)) };
  };
  const alPresionar = (e) => {
    if (!modoOcr) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    inicio.current = posicion(e);
    setRecuadro({ ...inicio.current, w: 0, h: 0 });
  };
  const alMover = (e) => {
    if (!modoOcr || !inicio.current) return;
    const p = posicion(e);
    const a = inicio.current;
    setRecuadro({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
  };
  const alSoltar = async () => {
    if (!modoOcr || !inicio.current) return;
    inicio.current = null;
    const r = recuadro;
    setTimeout(() => setRecuadro(null), 600);
    if (!r || r.w < 12 || r.h < 8) return;
    // Se vuelve a dibujar la página en alta resolución para que el OCR lea mejor
    const pagina = await pdf.getPage(numero);
    const factor = 3;
    const viewport = pagina.getViewport({ scale: escala * factor });
    const grande = document.createElement('canvas');
    grande.width = Math.floor(viewport.width);
    grande.height = Math.floor(viewport.height);
    await pagina.render({ canvasContext: grande.getContext('2d'), viewport }).promise;
    const recorte = document.createElement('canvas');
    recorte.width = Math.floor(r.w * factor);
    recorte.height = Math.floor(r.h * factor);
    recorte.getContext('2d').drawImage(grande, r.x * factor, r.y * factor, r.w * factor, r.h * factor, 0, 0, recorte.width, recorte.height);
    const caja = contenedorRef.current.getBoundingClientRect();
    onAreaOcr?.(recorte, { x: caja.left + r.x + r.w, y: caja.top + r.y + r.h });
  };

  return (
    <div
      ref={contenedorRef}
      className={`pagina-pdf ${modoOcr ? 'modo-ocr' : ''}`}
      data-pagina={numero}
      style={{ width: `${ancho * escala}px`, height: `${alto * escala}px` }}
    >
      <canvas ref={canvasRef} />
      <div ref={textoRef} className="textLayer" />
      {modoOcr && (
        <div className="capa-ocr" onPointerDown={alPresionar} onPointerMove={alMover} onPointerUp={alSoltar}>
          {recuadro && (
            <span className="recuadro-ocr" style={{ left: recuadro.x, top: recuadro.y, width: recuadro.w, height: recuadro.h }} />
          )}
        </div>
      )}
      <span className="pagina-pdf-numero">{numero}</span>
    </div>
  );
}

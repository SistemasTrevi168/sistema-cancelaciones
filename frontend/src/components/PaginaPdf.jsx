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
    if (!r || r.w < 8 || r.h < 6) return;
    const caja = contenedorRef.current.getBoundingClientRect();
    const pos = { x: caja.left + r.x + r.w, y: caja.top + r.y + r.h, arriba: caja.top + r.y };
    const pagina = await pdf.getPage(numero);
    // 1) Si el PDF trae texto en esa área, se toma tal cual (exacto, sin errores de lectura)
    const texto = await textoEnArea(pagina, escala, r);
    if (texto) { onAreaOcr?.(null, pos, texto); return; }
    // 2) Si es imagen (escaneado): se vuelve a dibujar el área en alta resolución y se prepara para el OCR
    const factor = Math.min(6, Math.max(3, 900 / Math.max(r.h, 1)));
    const viewport = pagina.getViewport({ scale: escala * factor });
    const grande = document.createElement('canvas');
    grande.width = Math.floor(viewport.width);
    grande.height = Math.floor(viewport.height);
    await pagina.render({ canvasContext: grande.getContext('2d'), viewport }).promise;
    onAreaOcr?.(prepararParaOcr(grande, r, factor), pos);
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

// Texto que el PDF trae dentro del recuadro (r en pixeles de la página a la escala actual).
// Los renglones se ordenan de arriba abajo y de izquierda a derecha; si el recuadro corta una frase,
// se toma solo la parte que queda dentro (sin partir palabras).
async function textoEnArea(pagina, escala, r) {
  try {
    const viewport = pagina.getViewport({ scale: escala });
    const contenido = await pagina.getTextContent();
    const piezas = [];
    for (const it of contenido.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
      const alto = Math.hypot(tx[2], tx[3]) || 1;
      const x = tx[4];
      const yBase = tx[5];
      const ancho = (it.width || 0) * viewport.scale || alto * it.str.length * 0.5;
      const arriba = yBase - alto;
      // el renglón debe quedar dentro del recuadro al menos a la mitad de su altura
      const dentroV = Math.min(yBase, r.y + r.h) - Math.max(arriba, r.y);
      if (dentroV < alto * 0.5) continue;
      const ini = Math.max(x, r.x);
      const fin = Math.min(x + ancho, r.x + r.w);
      if (fin - ini < Math.min(ancho, alto) * 0.3) continue;
      let txt = it.str;
      if (ini > x + 1 || fin < x + ancho - 1) {
        // parte del renglón: proporcional al ancho, ajustado a palabras completas
        const n = txt.length;
        let a = Math.round(((ini - x) / ancho) * n);
        let b = Math.round(((fin - x) / ancho) * n);
        while (a > 0 && txt[a - 1] !== ' ' && a < n && txt[a] !== ' ') a -= 1;
        while (b < n && txt[b - 1] !== ' ' && txt[b] !== ' ') b += 1;
        txt = txt.slice(a, b);
      }
      if (txt.trim()) piezas.push({ txt: txt.trim(), x: ini, y: yBase, alto });
    }
    if (!piezas.length) return '';
    piezas.sort((p, q) => p.y - q.y);
    const renglones = [];
    for (const p of piezas) {
      const ultimo = renglones[renglones.length - 1];
      if (ultimo && Math.abs(ultimo.y - p.y) < Math.max(ultimo.alto, p.alto) * 0.5) ultimo.piezas.push(p);
      else renglones.push({ y: p.y, alto: p.alto, piezas: [p] });
    }
    return renglones
      .map((ren) => ren.piezas.sort((p, q) => p.x - q.x).map((p) => p.txt).join(' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

// Recorte del área en escala de grises, con más contraste y un margen blanco: el OCR lee mejor así
function prepararParaOcr(grande, r, factor) {
  const margen = 24;
  const w = Math.max(1, Math.floor(r.w * factor));
  const h = Math.max(1, Math.floor(r.h * factor));
  const recorte = document.createElement('canvas');
  recorte.width = w + margen * 2;
  recorte.height = h + margen * 2;
  const ctx = recorte.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, recorte.width, recorte.height);
  ctx.drawImage(grande, r.x * factor, r.y * factor, w, h, margen, margen, w, h);
  try {
    const img = ctx.getImageData(0, 0, recorte.width, recorte.height);
    const d = img.data;
    // gris y umbral suave (Otsu simplificado: el promedio entre lo claro y lo oscuro)
    let suma = 0;
    const grises = new Uint8ClampedArray(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 1) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      grises[j] = g;
      suma += g;
    }
    const prom = suma / grises.length;
    let claros = 0; let nClaros = 0; let oscuros = 0; let nOscuros = 0;
    for (const g of grises) { if (g >= prom) { claros += g; nClaros += 1; } else { oscuros += g; nOscuros += 1; } }
    const umbral = nOscuros && nClaros ? (claros / nClaros + oscuros / nOscuros) / 2 : prom;
    for (let i = 0, j = 0; i < d.length; i += 4, j += 1) {
      const g = grises[j];
      // contraste: lo claro a blanco, lo oscuro a negro, con transición suave cerca del umbral
      const v = g > umbral + 25 ? 255 : g < umbral - 25 ? 0 : Math.round(((g - (umbral - 25)) / 50) * 255);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* si el navegador no deja leer los pixeles, se usa el recorte tal cual */ }
  return recorte;
}

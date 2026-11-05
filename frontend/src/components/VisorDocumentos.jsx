import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, CheckCircle, ChevronDown, ChevronUp, Copy, Highlighter, Layers, List, Loader2, Maximize2, Minimize2, ScanText, Search, Trash2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { abrirPdf } from '../ui/pdf';
import { leerTextoDeImagen } from '../ui/ocr';
import { CAMPOS_DEL_ACTO, etiquetaDe } from '../camposExpediente';
import { COLORES_SUBRAYADO, colorSubrayado, esColorLibre, useSubrayados } from '../ui/subrayados';
import PaginaPdf from './PaginaPdf';
import IconoArchivo from './IconoArchivo';

// Visor de los PDF del expediente (va dentro del espacio de trabajo, junto a los datos):
// permite subrayar palabras (con colores; se guardan y se ven siempre que se abra ese PDF),
// leer el texto de un área (OCR) y elegir de qué acto de la constancia se toman el acreditado,
// la escritura, el notario y el monto.
// destino: a qué expediente van los datos ({ origen: 'single' } o { origen: 'batch', index }).
export default function VisorDocumentos({ archivos: archivosProp, actos: actosProp, destino }) {
  const { theme, isDarkMode, usarActo } = useApp();
  // Se abre primero la constancia (el archivo de donde salen los actos)
  const [indiceArchivo, setIndiceArchivo] = useState(() => {
    const lista = actosProp || [];
    const doc = (lista.find((a) => a.elegido) || lista[0])?.documento;
    return Math.max(0, (archivosProp || []).findIndex((f) => f.name === doc));
  });
  const [pdf, setPdf] = useState(null);
  const [dims, setDims] = useState({ ancho: 612, alto: 792 });
  const [error, setError] = useState('');
  const [escalaManual, setEscalaManual] = useState(null);
  const [escalaAuto, setEscalaAuto] = useState(1);
  const [amplio, setAmplio] = useState(false);
  const [modoOcr, setModoOcr] = useState(false);
  const [ocr, setOcr] = useState(null); // { estado, progreso, texto, x, y }
  const [menu, setMenu] = useState(null); // texto leído de un área: { texto, x, y, arriba, deOcr }
  const [copiado, setCopiado] = useState(false);
  // Subrayar
  const [subrayar, setSubrayar] = useState(false);
  const [color, setColor] = useState(() => { try { return localStorage.getItem('subrayado-color') || 'amarillo'; } catch { return 'amarillo'; } });
  const [editando, setEditando] = useState(null); // subrayado al que se le dio clic: { id, x, y }
  const [verLista, setVerLista] = useState(false);
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false);
  const [botonMovil, setBotonMovil] = useState(null); // en celular: botón «Subrayar» junto a lo seleccionado
  const [resaltada, setResaltada] = useState(null);
  // El recuadro del texto leído se mide al aparecer para que nunca quede cortado abajo de la pantalla
  const colocarMenu = useCallback((el) => {
    if (el && menu) el.style.top = `${posicionMenu(menu, el.offsetHeight)}px`;
  }, [menu]);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [verActos, setVerActos] = useState(false);
  const [abiertos, setAbiertos] = useState({}); // actos con el texto completo a la vista
  const textos = useRef({}); // texto por página (para buscar)
  const paginas = useRef({});
  const zonaRef = useRef(null);

  const archivos = archivosProp || [];
  const archivo = archivos[indiceArchivo];
  const actos = actosProp || [];
  const actoEnUso = actos.find((a) => a.elegido);
  const sub = useSubrayados(archivo);
  const elegirColor = (c) => { setColor(c); try { localStorage.setItem('subrayado-color', c); } catch { /* sin almacenamiento */ } };

  // Esc: cierra el menú o sale de pantalla completa (el oyente se registra una sola vez)
  const alEscape = useRef(null);
  useEffect(() => {
    alEscape.current = () => {
      if (menu) setMenu(null);
      else if (editando) setEditando(null);
      else if (subrayar) { setSubrayar(false); setBotonMovil(null); }
      else if (amplio) setAmplio(false);
    };
  });
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.fondo-modal')) return;
      alEscape.current?.();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // Abrir el PDF elegido
  useEffect(() => {
    if (!archivo) return;
    let cancelado = false;
    abrirPdf(archivo)
      .then(async (doc) => {
        const primera = await doc.getPage(1);
        const vp = primera.getViewport({ scale: 1 });
        if (cancelado) return;
        setDims({ ancho: vp.width, alto: vp.height });
        setPdf(doc);
      })
      .catch(() => !cancelado && setError('No se pudo abrir este PDF.'));
    return () => { cancelado = true; };
  }, [archivo]);

  // Ajustar al ancho del visor
  useEffect(() => {
    const calcular = () => {
      const w = zonaRef.current?.clientWidth;
      if (w) setEscalaAuto(Math.max(0.4, Math.min(2, (w - 40) / dims.ancho)));
    };
    calcular();
    // Mientras se arrastra la pestaña del tamaño se espera un momento para no redibujar a cada pixel
    let t = null;
    const obs = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(calcular, 120); });
    if (zonaRef.current) obs.observe(zonaRef.current);
    return () => { clearTimeout(t); obs.disconnect(); };
  }, [dims.ancho, amplio, verActos]);
  const escala = escalaManual ?? escalaAuto;

  // Al cambiar de archivo se limpia lo del anterior
  const cambiarArchivo = (i) => {
    if (i === indiceArchivo) return;
    setPdf(null); setError(''); setResultados([]); setMenu(null); setEditando(null); setBotonMovil(null); setConfirmarLimpiar(false);
    textos.current = {}; paginas.current = {};
    setIndiceArchivo(i);
  };

  const registrarPagina = useCallback((n, el) => { paginas.current[n] = el; }, []);
  const irAPagina = (n) => paginas.current[n]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ---- Buscar texto en todo el documento ----
  useEffect(() => {
    const q = busqueda.trim().toLowerCase();
    if (!pdf || q.length < 3) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      const encontrados = [];
      for (let n = 1; n <= pdf.numPages && encontrados.length < 60; n++) {
        if (!textos.current[n]) {
          const p = await pdf.getPage(n);
          const c = await p.getTextContent();
          textos.current[n] = c.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ');
        }
        if (cancelado) return;
        const texto = textos.current[n];
        let i = texto.toLowerCase().indexOf(q);
        while (i >= 0 && encontrados.length < 60) {
          encontrados.push({ pagina: n, fragmento: `…${texto.slice(Math.max(0, i - 40), i + q.length + 60)}…` });
          i = texto.toLowerCase().indexOf(q, i + q.length);
        }
      }
      if (!cancelado) setResultados(encontrados);
    }, 350);
    return () => { cancelado = true; clearTimeout(t); };
  }, [busqueda, pdf]);

  // ---- Subrayar lo seleccionado con el mouse o el dedo ----
  const cajasPaginas = () => Object.entries(paginas.current)
    .filter(([, el]) => el)
    .map(([n, el]) => [Number(n), el.getBoundingClientRect()]);

  const subrayarSeleccion = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    if (!zonaRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) return false;
    // Se completa a palabras enteras (si se quedó media palabra fuera, se incluye)
    const rango = aPalabrasCompletas(sel.getRangeAt(0));
    const cajas = cajasPaginas();
    const porPagina = {};
    for (const r of rectsDeTexto(rango)) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = cajas.find(([, b]) => cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom);
      if (!hit) continue;
      const b = hit[1];
      if (!porPagina[hit[0]]) porPagina[hit[0]] = [];
      porPagina[hit[0]].push([(r.left - b.left) / escala, (r.top - b.top) / escala, r.width / escala, r.height / escala]);
    }
    const texto = rango.toString().replace(/\s+/g, ' ').trim().slice(0, 500);
    const nuevas = Object.entries(porPagina).map(([n, rs]) => ({
      id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      pagina: Number(n),
      color,
      rects: unirRenglones(rs).map((r) => r.map((v) => Math.round(v * 100) / 100)),
      texto,
    }));
    if (!nuevas.length) return false;
    sub.agregar(nuevas);
    sel.removeAllRanges();
    setBotonMovil(null);
    return true;
  };

  // Clic sin seleccionar nada: ¿cayó sobre un subrayado? (para cambiarle el color o quitarlo)
  const marcaEn = (x, y) => {
    const hit = cajasPaginas().find(([, b]) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom);
    if (!hit) return null;
    const px = (x - hit[1].left) / escala;
    const py = (y - hit[1].top) / escala;
    const deLaPagina = sub.marcas.filter((m) => m.pagina === hit[0]);
    for (let k = deLaPagina.length - 1; k >= 0; k -= 1) {
      const m = deLaPagina[k];
      if (m.rects.some(([rx, ry, rw, rh]) => px >= rx - 1 && px <= rx + rw + 1 && py >= ry - 1 && py <= ry + rh + 1)) return m;
    }
    return null;
  };

  // Mientras se arrastra para seleccionar, la capa de texto se marca «selecting» (como en pdf.js):
  // así la selección no brinca a toda la página ni al resto de la pantalla al pasar por espacios vacíos
  const alPresionar = (e) => {
    const capa = e.target.closest?.('.textLayer');
    if (!capa) return;
    capa.classList.add('selecting');
    const fin = () => {
      capa.classList.remove('selecting');
      const bloque = capa.querySelector('.endOfContent');
      if (bloque) { bloque.style.width = ''; bloque.style.height = ''; capa.append(bloque); }
      window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin);
    };
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', fin);
  };

  const alSoltar = (e) => {
    if (modoOcr) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && zonaRef.current?.contains(sel.anchorNode)) {
      if (subrayar && !window.matchMedia('(pointer: coarse)').matches) subrayarSeleccion();
      return;
    }
    const m = marcaEn(e.clientX, e.clientY);
    setEditando(m ? { id: m.id, x: e.clientX, y: e.clientY } : null);
  };

  // Mientras se selecciona, el bloque del final se pone junto a la última letra seleccionada (como pdf.js):
  // así, al pasar por un espacio vacío, la selección se queda en el mismo renglón
  useEffect(() => {
    let anterior = null;
    const acomodar = () => {
      const sel = document.getSelection();
      const zona = zonaRef.current;
      if (!sel || !sel.rangeCount || !zona) { anterior = null; return; }
      const rango = sel.getRangeAt(0);
      const alInicio = !!anterior && (rango.compareBoundaryPoints(Range.END_TO_END, anterior) === 0 || rango.compareBoundaryPoints(Range.START_TO_END, anterior) === 0);
      for (const capa of zona.querySelectorAll('.textLayer.selecting')) {
        const bloque = capa.querySelector('.endOfContent');
        if (!bloque || !rango.intersectsNode(capa)) continue;
        let ancla = alInicio ? rango.startContainer : rango.endContainer;
        if (ancla.nodeType === 3) ancla = ancla.parentNode;
        if (!ancla || ancla === capa || ancla === bloque || !capa.contains(ancla)) continue;
        bloque.style.width = capa.style.width;
        bloque.style.height = capa.style.height;
        ancla.parentElement.insertBefore(bloque, alInicio ? ancla : ancla.nextSibling);
      }
      anterior = rango.cloneRange();
    };
    document.addEventListener('selectionchange', acomodar);
    return () => document.removeEventListener('selectionchange', acomodar);
  }, []);

  useEffect(() => {
    // En celular no hay "mouseup": cuando termina de ajustar la selección aparece un botón «Subrayar»
    let t = null;
    const alCambiar = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!subrayar || !window.matchMedia('(pointer: coarse)').matches) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount || !zonaRef.current?.contains(sel.anchorNode)) { setBotonMovil(null); return; }
        const r = sel.getRangeAt(0).getBoundingClientRect();
        setBotonMovil({ x: r.left + r.width / 2, y: r.bottom });
      }, 400);
    };
    document.addEventListener('selectionchange', alCambiar);
    return () => { clearTimeout(t); document.removeEventListener('selectionchange', alCambiar); };
  }, [subrayar]);

  const irASubrayado = (m) => {
    irAPagina(m.pagina);
    setResaltada(m.id);
    setTimeout(() => setResaltada((r) => (r === m.id ? null : r)), 1800);
  };

  // ---- OCR de un área ----
  const alAreaOcr = async (imagen, pos, textoDelPdf) => {
    // El PDF ya traía texto en esa área: se usa directo (exacto)
    if (textoDelPdf) { setMenu({ texto: textoDelPdf, x: pos.x, y: pos.y, arriba: pos.arriba, deArea: true }); return; }
    setOcr({ estado: 'leyendo', progreso: 0, x: pos.x, y: pos.y });
    try {
      const texto = await leerTextoDeImagen(imagen, (m) => {
        if (m.status === 'recognizing text') setOcr((o) => (o ? { ...o, progreso: m.progress } : o));
        else if (m.status) setOcr((o) => (o ? { ...o, etapa: m.status } : o));
      });
      setOcr(null);
      if (!texto) { setError('No se encontró texto en esa área.'); return; }
      setMenu({ texto: limpiarOcr(texto), x: pos.x, y: pos.y, arriba: pos.arriba, deOcr: true });
    } catch {
      setOcr(null);
      setError('No se pudo leer el texto (OCR). Revisa tu conexión a internet e inténtalo de nuevo.');
    }
  };

  const copiar = async () => {
    const texto = menu?.texto || '';
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement('textarea');
      t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
      t.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };
  const marcaEditando = editando ? sub.marcas.find((m) => m.id === editando.id) : null;

  const boton = { background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 600 };

  return (
    <section
      className={`visor-embebido ${amplio ? 'visor-pantalla-completa' : ''}`}
      aria-label="Documentos del expediente"
      style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textPrimary }}
    >
      {/* ENCABEZADO */}
      <header style={{ padding: '8px 10px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.subtleBg, display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {/* Archivos y zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className="pestanas-archivos">
            {archivos.map((a, i) => (
              <button
                key={a.name + i}
                type="button"
                onClick={() => cambiarArchivo(i)}
                style={{ ...boton, padding: '5px 10px', backgroundColor: i === indiceArchivo ? theme.accent : theme.cardBg, color: i === indiceArchivo ? '#fff' : theme.textPrimary, borderColor: i === indiceArchivo ? theme.accent : theme.border, maxWidth: '210px', flexShrink: 0 }}
                title={a.name}
              >
                <IconoArchivo tipo="pdf" size={15} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              </button>
            ))}
            {archivos.length === 0 && <span style={{ fontSize: '12px', color: theme.textSecondary }}>Los PDF de este expediente ya no están en esta sesión (vuelve a subirlos para verlos).</span>}
          </div>
          <button type="button" style={boton} title="Alejar" onClick={() => setEscalaManual(Math.max(0.4, +(escala - 0.15).toFixed(2)))}><ZoomOut size={15} /></button>
          <button type="button" style={{ ...boton, minWidth: '46px' }} title="Ajustar al ancho" onClick={() => setEscalaManual(null)}>{Math.round(escala * 100)}%</button>
          <button type="button" style={boton} title="Acercar" onClick={() => setEscalaManual(Math.min(3, +(escala + 0.15).toFixed(2)))}><ZoomIn size={15} /></button>
          <button type="button" style={boton} title={amplio ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'} onClick={() => setAmplio(!amplio)}>{amplio ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        </div>

        {/* Buscar, OCR y actos */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '150px', display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '0 8px', backgroundColor: theme.inputBg }}>
            <Search size={14} color={theme.textSecondary} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en el documento…" style={{ border: 'none', outline: 'none', background: 'transparent', color: theme.textPrimary, padding: '6px 0', fontSize: '13px', width: '100%' }} />
          </div>
          <button
            type="button"
            className="boton-subrayar"
            aria-pressed={subrayar}
            onClick={() => { setSubrayar(!subrayar); setModoOcr(false); setMenu(null); setEditando(null); setBotonMovil(null); }}
            style={{ ...boton, padding: '6px 10px', backgroundColor: subrayar ? colorSubrayado(color) : theme.cardBg, borderColor: subrayar ? '#ca8a04' : theme.border, color: subrayar ? '#1f2937' : theme.textPrimary }}
            title="Subrayar palabras del PDF (se quedan guardadas en este documento)"
          >
            <Highlighter size={15} /> {subrayar ? 'Subrayando…' : 'Subrayar'}
          </button>
          {sub.marcas.length > 0 && (
            <button type="button" onClick={() => setVerLista(!verLista)} aria-expanded={verLista}
              style={{ ...boton, padding: '6px 10px', backgroundColor: verLista ? theme.subtleBg : theme.cardBg }} title="Ver la lista de lo subrayado en este PDF">
              <List size={15} /> {sub.marcas.length} subrayado{sub.marcas.length === 1 ? '' : 's'}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setModoOcr(!modoOcr); setSubrayar(false); setMenu(null); }}
            style={{ ...boton, padding: '6px 10px', backgroundColor: modoOcr ? '#7c3aed' : theme.cardBg, borderColor: modoOcr ? '#7c3aed' : theme.border, color: modoOcr ? '#fff' : theme.textPrimary }}
            title="Dibuja un recuadro sobre el PDF para leer el texto de esa área (útil si el texto no se puede seleccionar)"
          >
            <ScanText size={15} /> {modoOcr ? 'Dibuja un recuadro…' : 'Leer área (OCR)'}
          </button>
          {actos.length > 0 && verActos && (
            <button type="button" onClick={() => setVerActos(false)} style={{ ...boton, padding: '6px 10px' }}>
              <Layers size={15} /> Ocultar actos <ChevronUp size={14} />
            </button>
          )}
        </div>

        {/* Acto del que salieron los datos */}
        {actos.length > 0 && !verActos && (
          <div className="acto-en-uso" style={{ borderColor: actoEnUso ? (isDarkMode ? '#166534' : '#a7f3d0') : (isDarkMode ? '#a16207' : '#fcd34d'), backgroundColor: actoEnUso ? (isDarkMode ? '#052e16' : '#ecfdf5') : (isDarkMode ? '#422006' : '#fffbeb') }}>
            <Layers size={14} color={actoEnUso ? '#10b981' : '#d97706'} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {actoEnUso
                ? <>Datos del acto <strong>{actoEnUso.clave || 'elegido'}</strong>{actoEnUso.fecha ? ` (${actoEnUso.fecha})` : ''}, pág. {actoEnUso.pagina} · {actos.length} acto(s)</>
                : <>No se identificó la hipoteca entre los {actos.length} actos: elige uno.</>}
            </span>
            {actoEnUso && <button type="button" className="enlace-pequeno" onClick={() => irAPagina(actoEnUso.pagina)}>Ver</button>}
            <button type="button" className="enlace-pequeno" onClick={() => setVerActos(true)}>Cambiar <ChevronDown size={12} /></button>
          </div>
        )}
        {subrayar && (
          <div className="barra-subrayar" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
            <SelectorColor valor={color} onElegir={elegirColor} />
            <span className="barra-subrayar-ayuda" style={{ color: theme.textSecondary }}>
              Selecciona con el mouse las palabras a subrayar. Clic en un subrayado para cambiarle el color o quitarlo.
            </span>
          </div>
        )}
        {modoOcr && (
          <p style={{ margin: 0, fontSize: '11px', color: theme.textSecondary }}>Arrastra sobre la página para marcar el área que quieres leer.</p>
        )}
        {(sub.estado === 'error' || (!sub.disponible && sub.estado !== 'cargando' && subrayar)) && (
          <p style={{ margin: 0, fontSize: '11px', color: isDarkMode ? '#fdba74' : '#9a3412' }}>
            {sub.disponible ? 'Sin conexión con el servidor: los subrayados se guardan en esta computadora y se suben al reconectar.' : 'Este navegador no permite guardar los subrayados de este PDF.'}
          </p>
        )}
      </header>

      {/* RESULTADOS DE BÚSQUEDA */}
      {busqueda.trim().length >= 3 && resultados.length > 0 && (
        <div style={{ maxHeight: '140px', overflowY: 'auto', borderBottom: `1px solid ${theme.border}`, fontSize: '12px' }}>
          {resultados.map((r, i) => (
            <button key={i} type="button" onClick={() => irAPagina(r.pagina)} className="resultado-busqueda" style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: theme.textPrimary, padding: '6px 12px', cursor: 'pointer' }}>
              <strong style={{ color: theme.accent }}>Pág. {r.pagina}</strong> <span style={{ color: theme.textSecondary }}>{r.fragmento}</span>
            </button>
          ))}
        </div>
      )}

      {/* LISTA DE SUBRAYADOS */}
      {verLista && sub.marcas.length > 0 && (
        <div className="lista-subrayados" style={{ borderBottom: `1px solid ${theme.border}` }}>
          {[...sub.marcas].sort((a, b) => a.pagina - b.pagina || (a.rects[0]?.[1] || 0) - (b.rects[0]?.[1] || 0)).map((m) => (
            <div key={m.id} className="lista-subrayados-fila">
              <button type="button" onClick={() => irASubrayado(m)} className="resultado-busqueda" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', border: 'none', background: 'transparent', color: theme.textPrimary, padding: '6px 4px 6px 12px', cursor: 'pointer', fontSize: '12px' }}>
                <span className="punto-color chico" style={{ backgroundColor: colorSubrayado(m.color) }} />
                <strong style={{ color: theme.accent, flexShrink: 0 }}>Pág. {m.pagina}</strong>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.texto || '(sin texto)'}</span>
              </button>
              <button type="button" title="Quitar este subrayado" onClick={() => sub.quitar(m.id)} style={{ ...boton, border: 'none', padding: '6px 10px', color: theme.textSecondary }}><Trash2 size={14} /></button>
            </div>
          ))}
          <div style={{ padding: '6px 12px', display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
            {confirmarLimpiar ? (
              <>
                <span style={{ color: theme.textSecondary }}>¿Quitar todos los subrayados de este PDF?</span>
                <button type="button" style={{ ...boton, padding: '4px 10px' }} onClick={() => setConfirmarLimpiar(false)}>No</button>
                <button type="button" style={{ ...boton, padding: '4px 10px', backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#fff' }} onClick={() => { sub.limpiar(); setConfirmarLimpiar(false); setVerLista(false); }}>Sí, quitar todos</button>
              </>
            ) : (
              <button type="button" style={{ ...boton, padding: '4px 10px', color: theme.textSecondary }} onClick={() => setConfirmarLimpiar(true)}><Trash2 size={13} /> Quitar todos</button>
            )}
          </div>
        </div>
      )}

      <div className="panel-docs-cuerpo">
        {/* ACTOS DE LA CONSTANCIA */}
        {actos.length > 0 && verActos && (
          <section className="panel-docs-actos" style={{ borderRight: `1px solid ${theme.border}`, backgroundColor: theme.cardBg }}>
            <p style={{ fontSize: '11px', color: theme.textSecondary, margin: '0 0 8px 0' }}>
              El acreditado, el cónyuge, la escritura, la fecha, el notario y el monto se toman del acto marcado. Si no es el correcto, puedes usar cualquier otro.
            </p>
            {actos.map((acto) => (
              <article key={acto.id} className="tarjeta-acto" style={{ border: `1.5px solid ${acto.elegido ? '#10b981' : theme.border}`, backgroundColor: acto.elegido ? (isDarkMode ? '#052e16' : '#ecfdf5') : theme.subtleBg }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '4px' }}>
                  <span className="chip-acto" style={{ backgroundColor: acto.seccion === 'gravamenes' ? '#fee2e2' : acto.seccion === 'propiedad' ? '#dbeafe' : '#f1f5f9', color: acto.seccion === 'gravamenes' ? '#991b1b' : acto.seccion === 'propiedad' ? '#1e40af' : '#475569' }}>{acto.seccion_nombre}</span>
                  {acto.clave && <strong style={{ fontSize: '12px' }}>{acto.clave}</strong>}
                  {acto.fecha && <span style={{ fontSize: '11px', color: theme.textSecondary }} title={acto.fecha_inscripcion ? `Ingreso ${acto.fecha} · Inscripción ${acto.fecha_inscripcion}` : undefined}>{acto.fecha}{acto.fecha_inscripcion ? ` · inscr. ${acto.fecha_inscripcion}` : ''}</span>}
                  {acto.cancelada && <span className="chip-acto" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>Cancelada</span>}
                  {acto.elegido && <span className="chip-acto" style={{ backgroundColor: '#10b981', color: '#fff' }}><CheckCircle size={11} /> En uso</span>}
                </div>
                <p style={{ fontSize: '12px', margin: '0 0 6px 0', lineHeight: 1.4, color: theme.textPrimary, whiteSpace: 'pre-line' }}>
                  {abiertos[acto.id] ? acto.texto : acto.resumen}
                </p>
                {acto.texto && acto.texto.length > (acto.resumen || '').length + 5 && (
                  <button type="button" onClick={() => setAbiertos((a) => ({ ...a, [acto.id]: !a[acto.id] }))} style={{ background: 'none', border: 'none', padding: 0, margin: '0 0 6px 0', color: theme.accent, fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                    {abiertos[acto.id] ? 'Ver menos' : 'Ver texto completo'}
                  </button>
                )}
                {/* Lo que se toma de este acto si lo eliges */}
                <dl className="datos-acto" style={{ borderColor: theme.border }}>
                  {CAMPOS_DEL_ACTO.map((c) => (
                    <div key={c}>
                      <dt style={{ color: theme.textSecondary }}>{etiquetaDe(c)}</dt>
                      <dd style={{ color: acto.datos?.[c] ? theme.textPrimary : theme.textSecondary, fontStyle: acto.datos?.[c] ? 'normal' : 'italic' }}>
                        {acto.datos?.[`${c}_digitos`] && acto.datos?.[c]
                          ? `${acto.datos[`${c}_digitos`]} (${acto.datos[c]})`
                          : (acto.datos?.[c] || 'No viene en este acto')}
                      </dd>
                    </div>
                  ))}
                  {acto.datos?.acreedor && <div><dt style={{ color: theme.textSecondary }}>Acreedor</dt><dd>{acto.datos.acreedor}</dd></div>}
                </dl>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" style={{ ...boton, padding: '4px 8px', fontSize: '11px' }} onClick={() => {
                    const i = archivos.findIndex((a) => a.name === acto.documento);
                    if (i >= 0 && i !== indiceArchivo) { cambiarArchivo(i); setTimeout(() => irAPagina(acto.pagina), 700); } else irAPagina(acto.pagina);
                  }}>Ver (pág. {acto.pagina})</button>
                  <button type="button" disabled={acto.elegido} title="Tomar de este acto el acreditado, el cónyuge, la escritura, la fecha, el notario y el monto (los que traiga)" style={{ ...boton, padding: '4px 8px', fontSize: '11px', backgroundColor: theme.accent, borderColor: theme.accent, color: '#fff', opacity: acto.elegido ? 0.5 : 1 }} onClick={() => usarActo(acto, destino)}>
                    {acto.elegido ? 'En uso' : 'Usar este acto'}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {/* PÁGINAS */}
        <div ref={zonaRef} className={`panel-docs-paginas ${subrayar ? 'subrayando' : ''}`} onPointerDown={alPresionar} onMouseUp={alSoltar}
          style={{ backgroundColor: isDarkMode ? '#0b1220' : '#e2e8f0', '--color-seleccion': `${colorSubrayado(color)}aa` }}>
          {error && (
            <div role="alert" style={{ margin: '12px', padding: '10px 12px', borderRadius: '8px', backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', color: isDarkMode ? '#fca5a5' : '#991b1b', fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              {error} <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          )}
          {!pdf && !error && archivo && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px', color: theme.textSecondary, fontSize: '13px' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Abriendo PDF…
            </div>
          )}
          {pdf && Array.from({ length: pdf.numPages }, (_, i) => (
            <PaginaPdf
              key={`${indiceArchivo}-${i + 1}`}
              pdf={pdf}
              numero={i + 1}
              escala={escala}
              ancho={dims.ancho}
              alto={dims.alto}
              modoOcr={modoOcr}
              onAreaOcr={alAreaOcr}
              registrar={registrarPagina}
              marcas={sub.marcas.filter((m) => m.pagina === i + 1)}
              marcaActiva={resaltada || editando?.id}
            />
          ))}
        </div>
      </div>

      {/* LEYENDO OCR */}
      {ocr && (
        <div className="menu-campo" style={{ left: Math.min(ocr.x, window.innerWidth - 240), top: Math.min(ocr.y + 8, window.innerHeight - 80), backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textPrimary, padding: '12px', width: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Leyendo texto…
          </div>
          <div style={{ height: '5px', borderRadius: '99px', backgroundColor: theme.subtleBg, marginTop: '8px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((ocr.progreso || 0) * 100)}%`, backgroundColor: '#7c3aed', transition: 'width 0.2s' }} />
          </div>
          {ocr.etapa && ocr.etapa !== 'recognizing text' && <p style={{ fontSize: '11px', color: theme.textSecondary, margin: '6px 0 0 0' }}>Preparando el lector (solo la primera vez)…</p>}
        </div>
      )}

      {/* CELULAR: botón para subrayar lo seleccionado */}
      {botonMovil && subrayar && (
        <button type="button" className="boton-subrayar-flotante" onClick={subrayarSeleccion}
          style={{ left: Math.max(8, Math.min(botonMovil.x - 60, window.innerWidth - 128)), top: Math.min(botonMovil.y + 10, window.innerHeight - 60), backgroundColor: colorSubrayado(color) }}>
          <Highlighter size={16} /> Subrayar
        </button>
      )}

      {/* CLIC EN UN SUBRAYADO: cambiar color o quitar */}
      {marcaEditando && (
        <div className="menu-campo menu-subrayado" role="dialog" aria-label="Subrayado"
          style={{ left: Math.max(8, Math.min(editando.x - 140, window.innerWidth - 298)), top: editando.y + 150 > window.innerHeight ? Math.max(8, editando.y - 140) : editando.y + 10, width: '290px', backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textPrimary }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textSecondary, marginBottom: '4px' }}>SUBRAYADO · PÁG. {marcaEditando.pagina}</div>
            <div style={{ fontSize: '12px', maxHeight: '48px', overflow: 'auto' }}>{marcaEditando.texto ? `“${marcaEditando.texto}”` : '—'}</div>
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>Color</span>
            <SelectorColor valor={marcaEditando.color} onElegir={(c) => sub.recolorear(marcaEditando.id, c)} />
          </div>
          <div style={{ display: 'flex', borderTop: `1px solid ${theme.border}` }}>
            <button type="button" onClick={() => { sub.quitar(marcaEditando.id); setEditando(null); }} style={{ flex: 1, border: 'none', background: 'transparent', color: '#dc2626', padding: '9px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Trash2 size={14} /> Quitar subrayado
            </button>
            <button type="button" onClick={() => setEditando(null)} style={{ flex: 1, border: 'none', borderLeft: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, padding: '9px', cursor: 'pointer', fontSize: '12px' }}>Cerrar</button>
          </div>
        </div>
      )}

      {/* TEXTO LEÍDO DE UN ÁREA (OCR): se puede corregir y copiar */}
      {menu && (
        <div ref={colocarMenu} className="menu-campo" role="dialog" aria-label="Texto leído" style={{ left: Math.max(8, Math.min(menu.x - 140, window.innerWidth - 300)), top: posicionMenu(menu, 0), backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textPrimary }}>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textSecondary, marginBottom: '4px' }}>{menu.deOcr ? 'TEXTO LEÍDO (OCR) — puedes corregirlo' : 'TEXTO DEL ÁREA — puedes corregirlo'}</div>
            <textarea value={menu.texto} onChange={(e) => setMenu({ ...menu, texto: e.target.value })} rows={4} style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', fontFamily: 'inherit', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, padding: '6px' }} />
          </div>
          <div style={{ display: 'flex', borderTop: `1px solid ${theme.border}` }}>
            <button type="button" onClick={copiar} style={{ flex: 1, border: 'none', background: 'transparent', color: theme.accent, padding: '9px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar texto</>}
            </button>
            <button type="button" onClick={() => setMenu(null)} style={{ flex: 1, border: 'none', borderLeft: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, padding: '9px', cursor: 'pointer', fontSize: '12px' }}>Cerrar</button>
          </div>
        </div>
      )}
    </section>
  );
}

// Rectángulos (en pantalla) de solo el texto seleccionado dentro de la capa de texto del PDF
function rectsDeTexto(rango) {
  const raiz = rango.commonAncestorContainer.nodeType === 1 ? rango.commonAncestorContainer : rango.commonAncestorContainer.parentNode;
  const salida = [];
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const revisar = (n) => {
    if (!n.textContent || !n.parentElement?.closest('.textLayer') || !rango.intersectsNode(n)) return;
    const r = document.createRange();
    r.selectNodeContents(n);
    if (n === rango.startContainer) r.setStart(n, rango.startOffset);
    if (n === rango.endContainer) r.setEnd(n, rango.endOffset);
    for (const c of r.getClientRects()) if (c.width > 0.5 && c.height > 0.5) salida.push(c);
  };
  if (raiz.nodeType === 3) revisar(raiz);
  let n = recorrido.nextNode();
  while (n) { revisar(n); n = recorrido.nextNode(); }
  return salida;
}

// Extiende la selección para no cortar palabras a la mitad
const LETRA = /[\p{L}\p{N}]/u;
function aPalabrasCompletas(rango) {
  const r = rango.cloneRange();
  if (r.startContainer.nodeType === 3) {
    const t = r.startContainer.textContent;
    let i = r.startOffset;
    while (i > 0 && LETRA.test(t[i - 1])) i -= 1;
    r.setStart(r.startContainer, i);
  }
  if (r.endContainer.nodeType === 3) {
    const t = r.endContainer.textContent;
    let i = r.endOffset;
    while (i < t.length && LETRA.test(t[i])) i += 1;
    r.setEnd(r.endContainer, i);
  }
  return r;
}

// Colores de siempre + «otro color» (cualquiera, con el selector del navegador)
function SelectorColor({ valor, onElegir }) {
  const libre = esColorLibre(valor);
  return (
    <span className="barra-subrayar-colores" role="radiogroup" aria-label="Color del subrayado">
      {COLORES_SUBRAYADO.map((c) => (
        <button key={c.id} type="button" role="radio" aria-checked={valor === c.id} title={c.nombre} aria-label={c.nombre}
          className={`punto-color ${valor === c.id ? 'activo' : ''}`} style={{ backgroundColor: c.color }} onClick={() => onElegir(c.id)}>
          {valor === c.id && <Check size={12} />}
        </button>
      ))}
      <label className={`punto-color otro-color ${libre ? 'activo' : ''}`} title="Elegir otro color" aria-label="Elegir otro color"
        style={libre ? { background: valor } : undefined}>
        {libre ? <Check size={12} color="#fff" style={{ filter: 'drop-shadow(0 0 1px #000)' }} /> : <span className="otro-color-mas">+</span>}
        <input type="color" value={libre ? valor : '#a855f7'} onChange={(e) => onElegir(e.target.value.toLowerCase())} />
      </label>
    </span>
  );
}

// Junta los pedacitos de un mismo renglón en una sola franja
function unirRenglones(rects) {
  const orden = [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const out = [];
  for (const r of orden) {
    const u = out[out.length - 1];
    if (u && Math.abs(u[1] - r[1]) < Math.min(u[3], r[3]) * 0.5 && r[0] <= u[0] + u[2] + Math.max(u[3], r[3]) * 0.8) {
      const x1 = Math.min(u[0], r[0]);
      const y1 = Math.min(u[1], r[1]);
      const x2 = Math.max(u[0] + u[2], r[0] + r[2]);
      const y2 = Math.max(u[1] + u[3], r[1] + r[3]);
      out[out.length - 1] = [x1, y1, x2 - x1, y2 - y1];
    } else {
      out.push([...r]);
    }
  }
  return out;
}

// Debajo de lo seleccionado si cabe; si no, arriba; y siempre dentro de la pantalla
function posicionMenu(menu, alto) {
  const h = alto || 420;
  const margen = 12;
  const abajo = menu.y + 8;
  if (abajo + h <= window.innerHeight - margen) return abajo;
  const arriba = (menu.arriba ?? menu.y) - h - 8;
  if (arriba >= margen) return arriba;
  return Math.max(margen, window.innerHeight - h - margen);
}

// Limpieza del texto del OCR: saltos de línea, guiones de corte de renglón y caracteres sueltos que confunde
function limpiarOcr(texto) {
  return String(texto || '')
    .replace(/-\n\s*/g, '')
    .replace(/[|¦_~`]+/g, ' ')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}


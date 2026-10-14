import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle, ChevronDown, ChevronUp, Layers, Loader2, Maximize2, Minimize2, ScanText, Search, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { abrirPdf } from '../ui/pdf';
import { leerTextoDeImagen } from '../ui/ocr';
import { CAMPOS_DEL_ACTO, GRUPOS_CAMPOS, etiquetaDe } from '../camposExpediente';
import PaginaPdf from './PaginaPdf';
import IconoArchivo from './IconoArchivo';

// Visor de los PDF del expediente (va dentro del espacio de trabajo, junto a los datos):
// permite seleccionar texto (o un área con OCR) y mandarlo a un dato,
// y elegir de qué acto de la constancia se toman el acreditado, la escritura, el notario y el monto.
// destino: a qué expediente van los datos ({ origen: 'single' } o { origen: 'batch', index }).
export default function VisorDocumentos({ archivos: archivosProp, actos: actosProp, destino }) {
  const { theme, isDarkMode, asignarCampoDesdeDocumento, usarActo } = useApp();
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
  const [menu, setMenu] = useState(null); // { texto, x, y }
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

  // Esc: cierra el menú o sale de pantalla completa (el oyente se registra una sola vez)
  const alEscape = useRef(null);
  useEffect(() => {
    alEscape.current = () => { if (menu) setMenu(null); else if (amplio) setAmplio(false); };
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
    const obs = new ResizeObserver(calcular);
    if (zonaRef.current) obs.observe(zonaRef.current);
    return () => obs.disconnect();
  }, [dims.ancho, amplio, verActos]);
  const escala = escalaManual ?? escalaAuto;

  // Al cambiar de archivo se limpia lo del anterior
  const cambiarArchivo = (i) => {
    if (i === indiceArchivo) return;
    setPdf(null); setError(''); setResultados([]); setMenu(null);
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

  // ---- Texto seleccionado con el mouse o el dedo ----
  const revisarSeleccion = useCallback(() => {
    if (modoOcr) return;
    const sel = window.getSelection();
    const texto = sel?.toString().replace(/\s+/g, ' ').trim();
    if (!texto || !zonaRef.current?.contains(sel.anchorNode)) return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    setMenu({ texto, x: r.left + r.width / 2, y: r.bottom });
  }, [modoOcr]);

  useEffect(() => {
    // En celular no hay "mouseup": se espera a que termine de ajustar la selección
    let t = null;
    const alCambiar = () => { clearTimeout(t); t = setTimeout(() => { if (window.matchMedia('(pointer: coarse)').matches) revisarSeleccion(); }, 600); };
    document.addEventListener('selectionchange', alCambiar);
    return () => { clearTimeout(t); document.removeEventListener('selectionchange', alCambiar); };
  }, [revisarSeleccion]);

  // ---- OCR de un área ----
  const alAreaOcr = async (imagen, pos) => {
    setOcr({ estado: 'leyendo', progreso: 0, x: pos.x, y: pos.y });
    try {
      const texto = await leerTextoDeImagen(imagen, (m) => {
        if (m.status === 'recognizing text') setOcr((o) => (o ? { ...o, progreso: m.progress } : o));
        else if (m.status) setOcr((o) => (o ? { ...o, etapa: m.status } : o));
      });
      setOcr(null);
      if (!texto) { setError('No se encontró texto en esa área.'); return; }
      setMenu({ texto: texto.replace(/\s+/g, ' ').trim(), x: pos.x, y: pos.y, deOcr: true });
    } catch {
      setOcr(null);
      setError('No se pudo leer el texto (OCR). Revisa tu conexión a internet e inténtalo de nuevo.');
    }
  };

  const asignar = async (campo) => {
    const texto = menu.texto;
    setMenu(null);
    window.getSelection()?.removeAllRanges();
    await asignarCampoDesdeDocumento(campo, texto, destino);
  };

  const camposMenu = useMemo(() => GRUPOS_CAMPOS.map((g) => ({ ...g, campos: g.campos.filter((c) => c !== 'monto_letras') })), []);

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
            onClick={() => { setModoOcr(!modoOcr); setMenu(null); }}
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
        {(modoOcr || actos.length === 0) && (
          <p style={{ margin: 0, fontSize: '11px', color: theme.textSecondary }}>
            {modoOcr ? 'Arrastra sobre la página para marcar el área que quieres leer.' : 'Selecciona texto en el PDF para mandarlo a un dato del expediente.'}
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
                  {acto.fecha && <span style={{ fontSize: '11px', color: theme.textSecondary }}>{acto.fecha}</span>}
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
                        {c === 'numero_escritura' && acto.datos?.numero_escritura_digitos
                          ? `${acto.datos.numero_escritura_digitos} (${acto.datos[c]})`
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
        <div ref={zonaRef} className="panel-docs-paginas" onMouseUp={revisarSeleccion} style={{ backgroundColor: isDarkMode ? '#0b1220' : '#e2e8f0' }}>
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

      {/* MENÚ "USAR COMO…" */}
      {menu && (
        <div className="menu-campo" role="menu" style={{ left: Math.max(8, Math.min(menu.x - 140, window.innerWidth - 300)), top: Math.min(menu.y + 8, window.innerHeight - 380), backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textPrimary }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textSecondary, marginBottom: '4px' }}>{menu.deOcr ? 'TEXTO LEÍDO (OCR) — puedes corregirlo' : 'TEXTO SELECCIONADO'}</div>
            {menu.deOcr ? (
              <textarea value={menu.texto} onChange={(e) => setMenu({ ...menu, texto: e.target.value })} rows={3} style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', fontFamily: 'inherit', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, padding: '6px' }} />
            ) : (
              <div style={{ fontSize: '12px', maxHeight: '60px', overflow: 'auto' }}>“{menu.texto}”</div>
            )}
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px' }}>
            {camposMenu.map((g) => (
              <div key={g.titulo}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', color: theme.textSecondary, padding: '6px 8px 2px', textTransform: 'uppercase' }}>{g.titulo}</div>
                {g.campos.map((c) => (
                  <button key={c} type="button" role="menuitem" className="opcion-exportar" onClick={() => asignar(c)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: '6px', background: 'transparent', color: theme.textPrimary, padding: '6px 8px', fontSize: '13px', cursor: 'pointer' }}>
                    Usar como <strong>{etiquetaDe(c)}</strong>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setMenu(null)} style={{ width: '100%', border: 'none', borderTop: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, padding: '8px', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
        </div>
      )}
    </section>
  );
}


import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, CircleDashed, FileStack, FileX2, Loader2, Search, Trash2, Upload, X, XCircle } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import { creditoDeNombre } from '../ui/usarYaGenerados';
import ZonaArchivos from './ZonaArchivos';

const esPdf = (f) => /\.pdf$/i.test(f?.name || '');
const TIPO_TXT = { carta: 'Carta', carta2: 'Carta 2', constancia: 'Constancia' };
// Dos cartas del mismo crédito (coacreditados): la que dice "_2" (o va después) es la del trabajador dos
const ordenarCartas = (lista) => [...lista].sort((a, b) => {
  const dos = (f) => (/(?:[_\s-]|\()2\)?\.pdf$/i.test(f.name) ? 1 : 0);
  return dos(a) - dos(b) || a.name.localeCompare(b.name);
});

// Subir los PDF de expedientes que se guardaron antes de que el sistema guardara los PDF.
// Se eligen la carpeta de cartas y la de constancias; se juntan con cada expediente por el número de crédito.
// Solo se guardan los PDF: no se vuelven a leer ni se cambian los datos, el estado ni el Word.
export default function ModalCompletarPdfs({ onCerrar }) {
  const { theme, isDarkMode, pdfsDeSoltar } = useApp();
  const [cartas, setCartas] = useState([]);
  const [constancias, setConstancias] = useState([]);
  const [revision, setRevision] = useState(null); // { expedientes: [...] } del servidor
  const [revisando, setRevisando] = useState(false);
  const [reemplazar, setReemplazar] = useState(false);
  const [subiendo, setSubiendo] = useState(null); // { hechos, total, pct }
  const [estados, setEstados] = useState({}); // por renglón: { estado: espera|subiendo|listo|igual|error, pct, msg }
  const [resultado, setResultado] = useState(null);
  const [saliendo, setSaliendo] = useState(false);
  const [busca, setBusca] = useState('');
  const [verZonas, setVerZonas] = useState(true); // después de revisar se compactan para ver la lista
  const [danados, setDanados] = useState(() => new Set()); // archivos que no son PDF válidos
  const [filtro, setFiltro] = useState('todos');
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 15;
  const claveArchivo = (f) => `${f.name}|${f.size}`;

  const cerrar = () => {
    if (subiendo) return;
    setSaliendo(true);
    setTimeout(() => onCerrar?.(), 160);
  };
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agregar = (fijar) => (fs) => {
    const pdfs = Array.from(fs || []).filter(esPdf);
    fijar((prev) => {
      const ya = new Set(prev.map((f) => `${f.name}|${f.size}`));
      return [...prev, ...pdfs.filter((f) => !ya.has(`${f.name}|${f.size}`))];
    });
    setRevision(null); setResultado(null); setEstados({});
  };
  const quitar = (fijar) => (f) => { fijar((prev) => (f ? prev.filter((x) => x !== f) : [])); setRevision(null); setResultado(null); setEstados({}); };

  // Archivos por crédito
  const porCredito = useMemo(() => {
    const m = {};
    cartas.forEach((f) => { const c = creditoDeNombre(f.name); if (c) (m[c] ||= { cartas: [], constancias: [] }).cartas.push(f); });
    constancias.forEach((f) => { const c = creditoDeNombre(f.name); if (c) (m[c] ||= { cartas: [], constancias: [] }).constancias.push(f); });
    return m;
  }, [cartas, constancias]);
  const sinNumero = [...cartas, ...constancias].filter((f) => !creditoDeNombre(f.name));
  // Archivos cuyo crédito solo tiene carta o solo constancia (para el filtro «Sin pareja» de cada recuadro)
  const sinParejaNombres = useMemo(() => new Set(Object.values(porCredito)
    .filter((a) => !a.cartas.length || !a.constancias.length).flatMap((a) => [...a.cartas, ...a.constancias].map((f) => f.name))), [porCredito]);

  const revisar = async () => {
    const creditos = Object.keys(porCredito);
    if (!creditos.length) { avisar.aviso('Ningún archivo trae el número de crédito en su nombre.'); return; }
    setRevisando(true);
    try {
      // PDF dañados: vacíos o que no empiezan como PDF (se marcan y no se suben)
      const malos = new Set();
      await Promise.all([...cartas, ...constancias].map(async (f) => {
        try {
          const inicio = await f.slice(0, 5).text();
          if (f.size < 100 || !inicio.startsWith('%PDF')) malos.add(claveArchivo(f));
        } catch { malos.add(claveArchivo(f)); }
      }));
      setDanados(malos);
      setRevision((await api.post('/documentos/emparejar', { creditos })).data);
      setVerZonas(false);
    } catch (e) {
      avisar.error(`No se pudo revisar: ${e.response?.data?.detail || e.message}`);
    } finally {
      setRevisando(false);
    }
  };

  // Qué se sube a cada expediente
  const plan = useMemo(() => {
    if (!revision) return null;
    const porCred = {};
    (revision.expedientes || []).forEach((e) => { (porCred[e.credito] ||= []).push(e); });
    const filas = [];
    Object.entries(porCredito).forEach(([credito, a]) => {
      const exps = porCred[credito] || [];
      const cartasOrd = ordenarCartas(a.cartas);
      const pares = [];
      if (cartasOrd[0]) pares.push([cartasOrd[0], 'carta']);
      if (cartasOrd[1]) pares.push([cartasOrd[1], 'carta2']);
      if (a.constancias[0]) pares.push([a.constancias[0], 'constancia']);
      const sinPareja = !a.cartas.length || !a.constancias.length;
      const malos = pares.filter(([f]) => danados.has(claveArchivo(f)));
      const buenos = pares.filter(([f]) => !danados.has(claveArchivo(f)));
      const base = { credito, sinPareja, danados: malos };
      if (!exps.length) { filas.push({ ...base, exp: null, subir: [], omitir: buenos }); return; }
      exps.forEach((exp) => {
        const subir = buenos.filter(([, t]) => reemplazar || !exp.tiene.includes(t));
        const omitir = buenos.filter(([, t]) => !reemplazar && exp.tiene.includes(t));
        filas.push({ ...base, exp, subir, omitir });
      });
    });
    return filas.sort((x, y) => (!!y.exp - !!x.exp) || (y.subir.length - x.subir.length) || x.credito.localeCompare(y.credito));
  }, [revision, porCredito, reemplazar, danados]);

  const totalSubir = plan ? plan.reduce((n, f) => n + f.subir.length, 0) : 0;
  const expsSubir = plan ? plan.filter((f) => f.subir.length).length : 0;
  const sinExp = plan ? plan.filter((f) => !f.exp).length : 0;
  const yaTenian = plan ? plan.filter((f) => f.exp && !f.subir.length).length : 0;
  const nSinPareja = plan ? new Set(plan.filter((f) => f.sinPareja).map((f) => f.credito)).size : 0;
  const nDanados = plan ? new Set(plan.filter((f) => f.danados.length).map((f) => f.credito)).size : 0;
  const repetidos = plan ? new Set(plan.filter((f) => f.exp).map((f) => f.credito)).size !== plan.filter((f) => f.exp).length : false;

  const subirTodo = async () => {
    const trabajo = plan.filter((f) => f.subir.length);
    if (!trabajo.length) return;
    if (reemplazar && !(await confirmar(`Se van a reemplazar los PDF que ya tenían algunos expedientes por los que elegiste. ¿Continuar?`, { titulo: 'Reemplazar PDF', textoConfirmar: 'Sí, reemplazar' }))) return;
    // Se ve la lista de los que se suben, cada uno con su avance
    setBusca(''); setFiltro('subir'); setPagina(1); setResultado(null);
    setEstados(Object.fromEntries(trabajo.map((f) => [claveFila(f), { estado: 'espera', pct: 0 }])));
    const pesoDe = (f) => f.subir.reduce((n, [file]) => n + (file.size || 0), 0) || 1;
    const pesoTotal = trabajo.reduce((n, f) => n + pesoDe(f), 0);
    let pesoHecho = 0;
    setSubiendo({ hechos: 0, total: trabajo.length, pct: 0 });
    let ok = 0; let archivos = 0; const fallas = [];
    for (let i = 0; i < trabajo.length; i += 1) {
      const f = trabajo[i];
      const k = claveFila(f);
      setPagina(Math.floor(i / POR_PAGINA) + 1); // la página del que se está subiendo
      setEstados((e) => ({ ...e, [k]: { estado: 'subiendo', pct: 0 } }));
      // El renglón que se está subiendo se mantiene a la vista
      setTimeout(() => document.querySelector(`[data-fila="${CSS.escape(k)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
      const fd = new FormData();
      f.subir.forEach(([file, t]) => { fd.append('archivos', file); fd.append('tipos', t); });
      fd.append('solo_si_falta', reemplazar ? 'false' : 'true');
      try {
        const r = await api.post(`/expedientes/${f.exp.id}/documentos`, fd, {
          onUploadProgress: (ev) => {
            const pct = ev.total ? Math.min(99, Math.round((ev.loaded / ev.total) * 100)) : 50;
            setEstados((e) => ({ ...e, [k]: { estado: 'subiendo', pct } }));
            setSubiendo((s) => (s ? { ...s, pct: Math.min(99, Math.round(((pesoHecho + pesoDe(f) * (pct / 100)) / pesoTotal) * 100)) } : s));
          },
        });
        const n = (r.data?.guardados || []).length;
        ok += 1; archivos += n;
        setEstados((e) => ({ ...e, [k]: { estado: n ? 'listo' : 'igual', pct: 100, msg: n ? `${n} PDF` : 'Ya estaban' } }));
      } catch (e) {
        const msg = e.response?.data?.detail || e.message;
        fallas.push(`${f.credito}: ${msg}`);
        setEstados((st) => ({ ...st, [k]: { estado: 'error', pct: 0, msg } }));
      }
      pesoHecho += pesoDe(f);
      setSubiendo({ hechos: i + 1, total: trabajo.length, pct: Math.round((pesoHecho / pesoTotal) * 100) });
    }
    setSubiendo(null);
    setResultado({ ok, archivos, fallas, total: trabajo.length });
    if (!fallas.length) avisar.exito(`Listo: se guardaron ${archivos} PDF en ${ok} expediente(s).`);
    else avisar.aviso(`Se guardaron ${archivos} PDF; ${fallas.length} expediente(s) tuvieron problema.`);
  };

  const claveFila = (f) => `${f.credito}-${f.exp?.id || 'x'}`;
  const nErrores = Object.values(estados).filter((e) => e.estado === 'error').length;
  const FILTROS = {
    todos: () => true,
    error: (f) => estados[claveFila(f)]?.estado === 'error',
    subir: (f) => f.subir.length > 0,
    sinexp: (f) => !f.exp,
    sinpareja: (f) => f.sinPareja,
    danados: (f) => f.danados.length > 0,
    yatenian: (f) => f.exp && !f.subir.length && !f.danados.length,
  };
  const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filasVisibles = (plan || []).filter((f) => (FILTROS[filtro] || FILTROS.todos)(f)
    && (!busca.trim() || normal(`${f.credito} ${f.exp?.acreditado || ''}`).includes(normal(busca.trim()))));
  // Al cambiar filtro o búsqueda se regresa a la primera página
  const claveVista = `${filtro}|${busca}`;
  const [vistaAnterior, setVistaAnterior] = useState(claveVista);
  if (claveVista !== vistaAnterior) { setVistaAnterior(claveVista); setPagina(1); }
  const totalPaginas = Math.max(1, Math.ceil(filasVisibles.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const filasPagina = filasVisibles.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);

  // Quitar de la selección todos los archivos de uno o varios créditos (no se suben)
  const quitarCreditos = (lista) => {
    const fuera = new Set(lista);
    const queda = (f) => !fuera.has(creditoDeNombre(f.name));
    setCartas((prev) => prev.filter(queda));
    setConstancias((prev) => prev.filter(queda));
    setResultado(null); setEstados({});
  };
  const quitarVisibles = async () => {
    const creditosVis = [...new Set(filasVisibles.map((f) => f.credito))];
    if (!creditosVis.length) return;
    if (creditosVis.length > 1 && !(await confirmar(`Se quitarán de la selección los archivos de ${creditosVis.length} crédito(s). No se borra nada de tus carpetas.`, { titulo: 'Quitar archivos', textoConfirmar: `Quitar ${creditosVis.length}` }))) return;
    quitarCreditos(creditosVis);
    setFiltro('todos');
  };

  return (
    <div className={`fondo-modal ${saliendo ? 'saliendo' : ''}`} onClick={cerrar} role="dialog" aria-modal="true" aria-labelledby="completar-titulo">
      <div className={`modal-compartir modal-completar ${saliendo ? 'modal-salida' : 'modal-entrada'}`} onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
        <header className="modal-compartir-encabezado" style={{ borderColor: theme.border }}>
          <span className="modal-compartir-icono" style={{ backgroundColor: '#0891b21a', color: '#0891b2' }}><FileStack size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="completar-titulo">Subir PDF de expedientes anteriores</h3>
            <small style={{ color: theme.textSecondary }}>Solo se guardan los PDF: los datos, el estado y el Word no cambian.</small>
          </div>
          <button type="button" className="bitacora-cerrar" onClick={cerrar} aria-label="Cerrar" disabled={!!subiendo} style={{ color: theme.textSecondary }}><X size={20} /></button>
        </header>

        {/* Avance y resultado de la carga: siempre a la vista, arriba */}
        {subiendo && (
          <div className="completar-estado subiendo" aria-live="polite" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg }}>
            <div className="completar-estado-linea">
              <Loader2 size={16} className="girando" color={theme.accent} />
              <strong>Subiendo PDF… {subiendo.pct || 0}%</strong>
              <span style={{ color: theme.textSecondary }}>{subiendo.hechos} de {subiendo.total} expediente(s) · no cierres esta ventana</span>
            </div>
            <div className="barra-progreso" style={{ backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0' }}>
              <div style={{ width: `${subiendo.pct || 0}%`, backgroundColor: theme.accent }} />
            </div>
          </div>
        )}
        {resultado && !subiendo && (
          <div className={`completar-estado ${resultado.fallas.length ? 'parcial' : 'completo'}`} role="status">
            <div className="completar-estado-linea">
              {resultado.fallas.length ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
              <strong>{resultado.fallas.length ? 'Carga terminada con errores' : '¡Carga completa!'}</strong>
              <span>
                {resultado.archivos ? `Se guardaron ${resultado.archivos} PDF en ${resultado.ok} de ${resultado.total} expediente(s).` : `Los PDF de los ${resultado.ok} expediente(s) ya estaban guardados.`}
                {!resultado.fallas.length && ' Ya puedes editarlos con todo completo.'}
              </span>
              {resultado.fallas.length > 0 && (
                <button type="button" className="enlace-pequeno" onClick={() => setFiltro('error')}>Ver los {resultado.fallas.length} con error</button>
              )}
            </div>
            <div className="barra-progreso"><div style={{ width: '100%' }} /></div>
          </div>
        )}

        <div className="modal-completar-cuerpo">
          {!verZonas && plan ? (
            <div className="completar-zonas-compactas" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg }}>
              <FileStack size={16} color="#0891b2" />
              <span><strong>{cartas.length}</strong> carta(s) · <strong>{constancias.length}</strong> constancia(s)</span>
              {!subiendo && <button type="button" className="enlace-pequeno" onClick={() => setVerZonas(true)}>Cambiar archivos</button>}
            </div>
          ) : (<>
          <p className="modal-compartir-texto" style={{ color: theme.textSecondary, margin: '0 0 12px' }}>
            Elige la carpeta de <strong>cartas</strong> y la de <strong>constancias</strong> (o arrástralas). Cada PDF se junta con su expediente por el
            <strong> número de crédito del nombre del archivo</strong>, igual que en la Carga Masiva. Antes de subir verás el resumen.
          </p>
          <div className="zonas-tipo">
            <ZonaArchivos tipo="carta" varios archivos={cartas} sinPareja={sinParejaNombres} onElegir={agregar(setCartas)} onSoltar={async (e) => { e.preventDefault(); agregar(setCartas)(await pdfsDeSoltar(e)); }}
              onQuitar={quitar(setCartas)} ayuda="Carpeta o PDF sueltos de cartas" />
            <ZonaArchivos tipo="constancia" varios archivos={constancias} sinPareja={sinParejaNombres} onElegir={agregar(setConstancias)} onSoltar={async (e) => { e.preventDefault(); agregar(setConstancias)(await pdfsDeSoltar(e)); }}
              onQuitar={quitar(setConstancias)} ayuda="Carpeta o PDF sueltos de constancias" />
          </div>
          </>)}
          {sinNumero.length > 0 && (
            <p className="completar-aviso"><AlertTriangle size={14} /> {sinNumero.length} archivo(s) no traen número de crédito en el nombre y no se pueden juntar: {sinNumero.slice(0, 3).map((f) => f.name).join(', ')}{sinNumero.length > 3 ? '…' : ''}</p>
          )}

          {plan && (
            <div className="completar-resumen fade-in">
              <div className="completar-chips">
                <span className="chip-dato chip-ok"><CheckCircle size={12} /> {totalSubir} PDF a {expsSubir} expediente(s)</span>
                <label className="completar-reemplazar" style={{ color: theme.textSecondary }}>
                  <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} disabled={!!subiendo} /> Reemplazar los que ya tienen PDF
                </label>
              </div>
              <div className="completar-filtros" role="tablist" aria-label="Filtrar">
                {[
                  ['todos', `Todos (${plan.length})`],
                  ['subir', `Se suben (${expsSubir})`],
                  yaTenian > 0 && ['yatenian', `Ya tenían PDF (${yaTenian})`],
                  sinExp > 0 && ['sinexp', `Sin expediente (${sinExp})`],
                  nSinPareja > 0 && ['sinpareja', `Sin pareja (${nSinPareja})`],
                  nDanados > 0 && ['danados', `Dañados (${nDanados})`],
                  nErrores > 0 && ['error', `Con error (${nErrores})`],
                ].filter(Boolean).map(([id, txt]) => (
                  <button key={id} type="button" role="tab" aria-selected={filtro === id} className={`completar-filtro f-${id} ${filtro === id ? 'activo' : ''}`} onClick={() => setFiltro(id)} disabled={!!subiendo}>
                    {(id === 'danados' || id === 'error') && <FileX2 size={12} />}{(id === 'sinexp' || id === 'sinpareja') && <AlertTriangle size={12} />} {txt}
                  </button>
                ))}
                {filtro !== 'todos' && filtro !== 'subir' && filasVisibles.length > 0 && !subiendo && (
                  <button type="button" className="enlace-pequeno completar-quitar-todos" onClick={quitarVisibles}>
                    <Trash2 size={13} /> Quitar estos {new Set(filasVisibles.map((f) => f.credito)).size}
                  </button>
                )}
              </div>
              {repetidos && <p className="completar-aviso" style={{ color: theme.textSecondary }}>Hay créditos con más de un expediente guardado: sus PDF se guardan en todos.</p>}
              <label className="zona-buscador-campo" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, marginBottom: 8 }}>
                <Search size={14} color={theme.textSecondary} />
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar crédito o acreditado…" style={{ color: theme.textPrimary }} />
              </label>
              <div className="completar-tabla" style={{ borderColor: theme.border }}>
                {filasPagina.length === 0 && <div className="completar-fila" style={{ color: theme.textSecondary }}>Ningún crédito coincide.</div>}
                {filasPagina.map((f, i) => (
                  <div key={`${f.credito}-${f.exp?.id || 'x'}`} data-fila={claveFila(f)} className={`completar-fila ${f.exp ? '' : 'sin-exp'}`} style={{ borderColor: theme.border, animationDelay: `${Math.min(i, 14) * 20}ms` }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong>{f.credito}</strong> <span style={{ color: theme.textSecondary }}>{f.exp ? `· ${f.exp.acreditado || 'Sin nombre'} · ${f.exp.propietario}` : '· no hay expediente con este crédito'}</span>
                      {(f.sinPareja || f.danados.length > 0) && (
                        <span className="completar-marcas">
                          {f.sinPareja && <em className="etiqueta-sin-pareja" title="Solo está la carta o solo la constancia de este crédito">sin pareja</em>}
                          {f.danados.map(([file]) => <em key={file.name} className="etiqueta-danado" title={`${file.name} está vacío o no es un PDF válido: no se sube`}>dañado: {file.name}</em>)}
                        </span>
                      )}
                    </div>
                    <div className="completar-tipos">
                      {f.subir.map(([, t]) => <span key={`s${t}`} className="tipo-pdf subir">{TIPO_TXT[t]}</span>)}
                      {f.omitir.map(([, t]) => <span key={`o${t}`} className="tipo-pdf omitir" title={f.exp ? 'Ya tenía este PDF: se deja el que estaba' : 'No se sube'}>{TIPO_TXT[t]}</span>)}
                    </div>
                    {estados[claveFila(f)] && (() => {
                      const st = estados[claveFila(f)];
                      if (st.estado === 'espera') return <span className="estado-subida espera"><CircleDashed size={13} /> En espera</span>;
                      if (st.estado === 'subiendo') return (
                        <span className="estado-subida subiendo">
                          <span className="mini-barra"><span style={{ width: `${st.pct}%`, backgroundColor: theme.accent }} /></span>{st.pct}%
                        </span>
                      );
                      if (st.estado === 'error') return <span className="estado-subida error" title={st.msg}><XCircle size={13} /> Error</span>;
                      return <span className="estado-subida listo" title={st.msg}><CheckCircle size={13} /> {st.estado === 'igual' ? 'Ya estaban' : 'Subido'}</span>;
                    })()}
                    {!subiendo && !estados[claveFila(f)] && (
                      <button type="button" className="quitar-archivo completar-quitar" title={`Quitar los archivos del crédito ${f.credito} (no se suben)`} aria-label={`Quitar ${f.credito}`}
                        onClick={() => quitarCreditos([f.credito])}><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              {totalPaginas > 1 && (
                <div className="completar-paginas" style={{ color: theme.textSecondary }}>
                  <button type="button" className="boton-icono" onClick={() => setPagina(paginaVista - 1)} disabled={paginaVista <= 1} aria-label="Página anterior" style={{ borderColor: theme.border, color: theme.textPrimary }}><ChevronLeft size={15} /></button>
                  <span>Página <strong style={{ color: theme.textPrimary }}>{paginaVista}</strong> de {totalPaginas} · {filasVisibles.length} crédito(s)</span>
                  <button type="button" className="boton-icono" onClick={() => setPagina(paginaVista + 1)} disabled={paginaVista >= totalPaginas} aria-label="Página siguiente" style={{ borderColor: theme.border, color: theme.textPrimary }}><ChevronRight size={15} /></button>
                </div>
              )}
            </div>
          )}

        </div>

        <footer className="modal-compartir-pie" style={{ borderColor: theme.border }}>
          <small style={{ color: theme.textSecondary }}>{cartas.length} carta(s) · {constancias.length} constancia(s)</small>
          <button type="button" className="boton-barra" onClick={cerrar} disabled={!!subiendo} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!plan ? (
            <button type="button" className="boton-barra" onClick={revisar} disabled={revisando || (!cartas.length && !constancias.length)} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
              {revisando ? <Loader2 size={15} className="girando" /> : <Search size={15} />} Revisar
            </button>
          ) : (
            <button type="button" className="boton-barra" onClick={subirTodo} disabled={!!subiendo || totalSubir === 0 || !!resultado} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
              {subiendo ? <Loader2 size={15} className="girando" /> : <Upload size={15} />} {resultado ? 'Listo' : `Subir ${totalSubir} PDF`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

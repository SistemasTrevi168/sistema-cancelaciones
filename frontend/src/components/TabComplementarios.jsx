import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, History, Info, Loader2, RefreshCw, Search, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import Selector from './Selector';

// Datos complementarios: el Excel que llega después (EXP., ESC, VOL., FECHA) se coteja con los expedientes
// guardados por NÚMERO DE CRÉDITO y NOMBRE DEL ACREDITADO, y se llenan sus Word.

const COTEJOS = {
  coincide: { texto: 'Coincide', detalle: 'El crédito y el nombre coinciden', color: '#15803d', fondo: '#dcfce7', listo: true },
  revisar_nombre: { texto: 'Revisar nombre', detalle: 'El crédito coincide, pero el nombre está escrito distinto', color: '#b45309', fondo: '#fef3c7' },
  solo_nombre: { texto: 'Solo el nombre', detalle: 'No hay ese crédito; se encontró por el nombre. Confírmalo', color: '#b45309', fondo: '#fef3c7' },
  varios: { texto: 'Elegir expediente', detalle: 'Hay más de un expediente posible: elige cuál', color: '#7c3aed', fondo: '#ede9fe' },
  distinto: { texto: 'Ya tenía otros datos', detalle: 'El expediente ya tiene datos complementarios distintos; se cambiarían', color: '#b91c1c', fondo: '#fee2e2' },
  ya_lleno: { texto: 'Ya tenía estos datos', detalle: 'El expediente ya tiene exactamente estos datos', color: '#475569', fondo: '#f1f5f9' },
  no_encontrado: { texto: 'Sin expediente', detalle: 'Queda pendiente: se llenará solo cuando se guarde ese expediente', color: '#b91c1c', fondo: '#fef2f2' },
  llenado: { texto: 'Llenado', detalle: 'Este renglón ya se usó', color: '#15803d', fondo: '#f0fdf4' },
};
const FILTROS = [['todos', 'Todos'], ['coincide', 'Coinciden'], ['revisar', 'Por revisar'], ['no_encontrado', 'Sin expediente'], ['llenado', 'Llenados'], ['ya_lleno', 'Ya tenían']];
const POR_PAGINA = 15;
const fechaCorta = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};
const nombreUsuario = (u, lista) => (lista || []).find((x) => x.username === u)?.nombre_mostrar || u;

export default function TabComplementarios() {
  const { theme, isDarkMode, descargarZipIds, descargandoZipIds, usuariosLista } = useApp();
  const [excels, setExcels] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [res, setRes] = useState(null); // {excel, ya_usado, faltan_columnas, filas}
  const [elegidos, setElegidos] = useState({}); // n -> expediente_id
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [llenando, setLlenando] = useState(false);
  const [llenadosAhora, setLlenadosAhora] = useState([]);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef(null);
  const inputWords = useRef(null);
  const [subiendoWords, setSubiendoWords] = useState(false);
  const [words, setWords] = useState(null); // {resultados, llenados, zip}
  // Fecha de término (párrafo «firma ante mí el día … del mes de … del año …»): opcional, se aplica a lo que se llene ahora
  const [fechaTermino, setFechaTermino] = useState('');
  const terminoTexto = fechaTermino ? new Date(`${fechaTermino}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const cargarLista = () => api.get('/complementarios').then((r) => setExcels(r.data?.excels || [])).catch(() => setExcels([]));
  useEffect(() => { cargarLista(); }, []);

  // Selección inicial: los que coinciden por crédito y nombre
  const preparar = (data) => {
    setRes(data);
    const sel = {};
    (data.filas || []).forEach((f) => { if (f.cotejo === 'coincide' && f.exp) sel[f.n] = f.exp.id; });
    setElegidos(sel);
    setFiltro('todos');
    setBusca('');
    setPagina(1);
  };

  const analizar = async (archivo) => {
    if (!archivo) return;
    if (!/\.xlsx?$/i.test(archivo.name)) { avisar.aviso('Elige un archivo de Excel (.xlsx).'); return; }
    setAnalizando(true);
    setLlenadosAhora([]);
    try {
      const fd = new FormData();
      fd.append('file', archivo);
      const r = await api.post('/complementarios/analizar', fd, { timeout: 0 });
      preparar(r.data);
      if (r.data.ya_usado) {
        avisar.aviso(r.data.excel.completo ? 'Este Excel ya se usó completo.' : `Este Excel ya se había subido: quedan ${r.data.excel.pendientes} renglón(es) pendiente(s).`);
      }
      cargarLista();
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo leer el Excel.');
    } finally {
      setAnalizando(false);
      if (input.current) input.current.value = '';
    }
  };

  const abrir = async (x) => {
    setAnalizando(true);
    setLlenadosAhora([]);
    try { preparar((await api.get(`/complementarios/${x.id}`)).data); } catch (err) { avisar.error(err.response?.data?.detail || 'No se pudo abrir.'); } finally { setAnalizando(false); }
  };

  const filas = useMemo(() => res?.filas || [], [res]);
  const cuenta = (k) => filas.filter((f) => (k === 'revisar' ? ['revisar_nombre', 'solo_nombre', 'varios', 'distinto'].includes(f.cotejo) : f.cotejo === k)).length;
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const visibles = filas
    .filter((f) => filtro === 'todos' || (filtro === 'revisar' ? ['revisar_nombre', 'solo_nombre', 'varios', 'distinto'].includes(f.cotejo) : f.cotejo === filtro))
    .filter((f) => !busca.trim() || norm(`${f.nombre} ${f.credito} ${f.expediente} ${f.exp?.nombre || ''}`).includes(norm(busca.trim())));
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const pag = Math.min(pagina, totalPaginas);
  const enPagina = visibles.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const nElegidos = Object.keys(elegidos).length;
  const seleccionables = (f) => !['llenado', 'ya_lleno', 'no_encontrado'].includes(f.cotejo);
  const visiblesSel = visibles.filter((f) => seleccionables(f) && (f.exp || elegidos[f.n]));

  const alternar = (f, id) => setElegidos((e) => {
    const n = { ...e };
    if (n[f.n] && !id) delete n[f.n]; else if (id || f.exp) n[f.n] = id || f.exp.id;
    return n;
  });

  const llenar = async () => {
    const lista = filas.filter((f) => elegidos[f.n]).map((f) => ({ n: f.n, expediente_id: elegidos[f.n] }));
    if (!lista.length) return;
    const cambian = filas.filter((f) => elegidos[f.n] && f.cotejo === 'distinto').length;
    const ok = await confirmar(
      `Se guardarán los datos del Excel en ${lista.length} expediente(s) y se volverán a generar sus Word.${cambian ? ` ${cambian} ya tenían otros datos complementarios y se cambiarán.` : ''} ${terminoTexto ? ` Fecha de término: ${terminoTexto}.` : ''} Su estado (Generado, Revisado o Entregado) no cambia.`,
      { titulo: 'Llenar y regenerar', textoConfirmar: `Llenar ${lista.length}` },
    );
    if (!ok) return;
    setLlenando(true);
    try {
      const r = await api.post(`/complementarios/${res.excel.id}/llenar`, { filas: lista, fecha_termino: fechaTermino || '' }, { timeout: 0 });
      const d = r.data || {};
      setRes((x) => ({ ...x, excel: d.excel, filas: d.filas }));
      setElegidos({});
      setLlenadosAhora((a) => [...a, ...(d.llenados || []).map((l) => l.expediente_id)]);
      if (d.errores?.length) avisar.aviso(`Se llenaron ${d.llenados.length}; ${d.errores.length} no se pudieron (${d.errores[0].error}).`);
      else avisar.exito(`Listo: ${d.llenados.length} expediente(s) llenados y con su Word nuevo.`);
      if (d.excel?.completo) avisar.exito('Este Excel ya se usó completo. Puedes cargar otro.');
      cargarLista();
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudieron llenar.');
    } finally {
      setLlenando(false);
    }
  };

  const otroExcel = () => { setRes(null); setElegidos({}); setLlenadosAhora([]); setWords(null); cargarLista(); };

  // Word hechos fuera del sistema: se llenan con su renglón del Excel (por su crédito o su nombre)
  const subirWords = async (lista) => {
    const archivos = [...(lista || [])].filter((f) => /\.docx$/i.test(f.name));
    if (!archivos.length) { avisar.aviso('Elige uno o varios Word (.docx).'); return; }
    setSubiendoWords(true);
    try {
      const fd = new FormData();
      archivos.forEach((f) => fd.append('files', f));
      if (fechaTermino) fd.append('fecha_termino', fechaTermino);
      const r = await api.post(`/complementarios/${res.excel.id}/words`, fd, { timeout: 0 });
      const d = r.data || {};
      setWords(d);
      setRes((x) => ({ ...x, excel: d.excel, filas: d.filas }));
      if (d.llenados) avisar.exito(`Listo: ${d.llenados} Word llenado(s). Descárgalos en el ZIP.`);
      else avisar.aviso('No se pudo llenar ninguno de esos Word. Revisa el detalle.');
      cargarLista();
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudieron subir los Word.');
    } finally {
      setSubiendoWords(false);
      if (inputWords.current) inputWords.current.value = '';
    }
  };
  const bajarZipWords = async () => {
    try {
      const r = await api.get(`/complementarios/zip/${words.zip}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'Word_llenados.zip';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      avisar.error('Ese ZIP ya no está disponible; vuelve a subir los Word.');
    }
  };
  const LUGARES = { encabezado: 'encabezado', instrumento: 'instrumento', volumen: 'volumen', PE: 'PE', fecha: 'fecha', 'EXP.': 'EXP.', 'fecha de término': 'fecha de término' };

  const tarjeta = { backgroundColor: theme.cardBg, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '22px' };
  const ex = res?.excel;

  return (
    <div className="tab-complementarios" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={tarjeta}>
        <h2 style={{ margin: '0 0 4px', fontSize: '20px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileSpreadsheet size={22} color={theme.accent} /> Datos complementarios
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: theme.textSecondary }}>
          Sube el Excel que llega después (EXP., ESC, VOL. y FECHA). El sistema busca cada renglón por <b>número de crédito</b> y lo comprueba con el <b>nombre del acreditado</b>; luego llena esos datos y vuelve a generar el Word de cada expediente.
        </p>

        {!res && (
          <div
            className={`zona-complementarios ${arrastrando ? 'arrastrando' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); analizar(e.dataTransfer.files?.[0]); }}
            style={{ marginTop: '16px', border: `2px dashed ${arrastrando ? theme.accent : theme.border}`, borderRadius: '14px', padding: '28px 16px', textAlign: 'center', backgroundColor: theme.dropzoneBg }}>
            {analizando ? (
              <p style={{ margin: 0, color: theme.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Loader2 size={18} className="girando" /> Leyendo el Excel y buscando los expedientes…</p>
            ) : (
              <>
                <Upload size={26} color={theme.accent} />
                <p style={{ margin: '8px 0 12px', color: theme.textPrimary, fontWeight: 600 }}>Arrastra aquí el Excel o elígelo</p>
                <button type="button" className="boton-barra" onClick={() => input.current?.click()} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
                  <FileSpreadsheet size={15} /> Elegir Excel
                </button>
                <input ref={input} type="file" accept=".xlsx,.xls" hidden onChange={(e) => analizar(e.target.files?.[0])} />
                <p style={{ margin: '12px 0 0', fontSize: '12px', color: theme.textSecondary }}>Se lee la hoja «254» (o la primera que tenga los encabezados). Los datos de FOLIO no se usan.</p>
              </>
            )}
          </div>
        )}

        {!res && excels && excels.length > 0 && (
          <div className="excels-cargados" style={{ marginTop: '16px' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '14px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={16} color={theme.accent} /> Excel que ya están cargados
              <span style={{ fontWeight: 400, fontSize: '12px', color: theme.textSecondary }}>· úsalos de nuevo sin volver a subirlos</span>
            </h3>
            <ul className="lista-excels-complementarios" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {excels.map((x) => (
                <li key={x.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px', padding: '10px 0', borderTop: `1px solid ${theme.border}` }}>
                  <FileSpreadsheet size={18} color="#15803d" />
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: theme.textPrimary, overflowWrap: 'anywhere' }}>{x.nombre}</div>
                    <div style={{ fontSize: '12px', color: theme.textSecondary }}>Subido el {fechaCorta(x.creado_en)} por {nombreUsuario(x.subido_por, usuariosLista)}</div>
                  </div>
                  {x.completo
                    ? <span className="chip-dato chip-ok"><CheckCircle2 size={12} /> Usado completo ({x.total})</span>
                    : <span className="chip-dato chip-falta">{x.llenados} de {x.total} llenados · {x.pendientes} pendientes</span>}
                  <button type="button" className="boton-barra" onClick={() => abrir(x)} disabled={analizando} style={{ backgroundColor: x.completo ? theme.cardBg : theme.accent, color: x.completo ? theme.textPrimary : '#fff', borderColor: x.completo ? theme.border : theme.accent }}>
                    {x.completo ? 'Ver' : 'Usar este Excel'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {res && ex && (
        <div style={tarjeta}>
          <div className="complementarios-cabecera" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px', marginBottom: '12px' }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <div style={{ fontWeight: 700, color: theme.textPrimary, overflowWrap: 'anywhere' }}>{ex.nombre}</div>
              <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                Hoja «{ex.hoja}» · subido por {nombreUsuario(ex.subido_por, usuariosLista)} el {fechaCorta(ex.creado_en)}
              </div>
            </div>
            <span className="chip-dato" style={{ backgroundColor: theme.subtleBg, borderColor: theme.border, color: theme.textPrimary }}>{ex.total} renglones</span>
            <span className="chip-dato chip-ok">{ex.llenados} llenados</span>
            <span className="chip-dato chip-falta">{ex.pendientes} pendientes</span>
            <button type="button" className="boton-barra" onClick={otroExcel} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
              <Upload size={15} /> Cargar otro Excel
            </button>
          </div>

          {ex.completo ? (
            <div className="aviso-complementarios ok"><CheckCircle2 size={16} /> <span><b>Este Excel ya se usó completo.</b> Todos sus renglones ya se llenaron en sus expedientes. Puedes cargar otro.</span></div>
          ) : res.ya_usado && (
            <div className="aviso-complementarios"><History size={16} /> <span><b>Este Excel ya se había subido</b> el {fechaCorta(ex.creado_en)}. Se muestra cómo va: {ex.llenados} llenados y {ex.pendientes} pendientes.</span></div>
          )}
          {res.faltan_columnas?.length > 0 && (
            <div className="aviso-complementarios alerta"><AlertTriangle size={16} /> <span>No encontré la(s) columna(s) <b>{res.faltan_columnas.join(', ')}</b>; esos datos quedarán vacíos.</span></div>
          )}

          <div className="fecha-termino-complementarios" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '10px 14px', margin: '10px 0', backgroundColor: theme.subtleBg }}>
            <label htmlFor="fecha-termino" style={{ fontWeight: 700, fontSize: '13px', color: theme.textPrimary }}>Fecha de término <span style={{ fontWeight: 400, color: theme.textSecondary }}>(opcional)</span></label>
            <input id="fecha-termino" type="date" value={fechaTermino} onChange={(e) => setFechaTermino(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px' }} />
            {fechaTermino && <button type="button" className="enlace-pequeno" onClick={() => setFechaTermino('')} style={{ color: theme.accent }}>Quitar</button>}
            <span style={{ flex: '1 1 260px', fontSize: '12px', color: theme.textSecondary }}>
              Va en «firma ante mí el día … del mes de … del año …» de los que llenes ahora (del Excel y de los Word que subas). Si la dejas vacía, ese renglón se queda en blanco como siempre. También se puede poner en cada expediente al editarlo.
            </span>
          </div>

          <div className="panel-words-complementarios" style={{ border: `1px dashed ${theme.border}`, borderRadius: '12px', padding: '12px 14px', margin: '10px 0', backgroundColor: theme.dropzoneBg }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
              <FileText size={18} color={theme.accent} />
              <div style={{ flex: '1 1 260px', fontSize: '13px', color: theme.textPrimary }}>
                <b>¿Tienes Word hechos fuera del sistema?</b>
                <span style={{ color: theme.textSecondary }}> Súbelos aquí: cada uno se busca en este Excel por su número de crédito (o su nombre) y se le llenan EXP., escritura, volumen y fecha. Te los regresa en un ZIP.</span>
              </div>
              <button type="button" className="boton-barra boton-subir-words" disabled={subiendoWords} onClick={() => inputWords.current?.click()}
                style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                {subiendoWords ? <Loader2 size={15} className="girando" /> : <Upload size={15} />} Subir Word
              </button>
              <input ref={inputWords} type="file" accept=".docx" multiple hidden onChange={(e) => subirWords(e.target.files)} />
            </div>
            {words && (
              <div className="resultado-words" style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span className="chip-dato chip-ok">{words.llenados} llenado(s)</span>
                  {words.resultados.length - words.llenados > 0 && <span className="chip-dato chip-falta">{words.resultados.length - words.llenados} sin llenar</span>}
                  {words.zip && (
                    <button type="button" className="boton-barra" onClick={bajarZipWords} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent, marginLeft: 'auto' }}>
                      <Download size={15} /> Descargar Word llenados (ZIP)
                    </button>
                  )}
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '12.5px' }}>
                  {words.resultados.map((w, i) => (
                    <li key={`${w.archivo}-${i}`} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '5px 0', borderTop: `1px solid ${theme.border}` }}>
                      {w.estado === 'llenado' ? <CheckCircle2 size={15} color="#15803d" style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />}
                      <span style={{ color: theme.textPrimary, minWidth: 0, overflowWrap: 'anywhere' }}>
                        <b>{w.archivo}</b>
                        {w.nombre && <> → {w.nombre} (renglón {w.n}{w.por === 'nombre' ? ', por su nombre' : ''})</>}
                        {w.lugares?.length > 0 && <span style={{ color: theme.textSecondary }}> · se llenó: {w.lugares.map((l) => LUGARES[l] || l).join(', ')}</span>}
                        {w.nombre_ok === false && <span style={{ color: '#b45309' }}> · el nombre del Word no coincide igual con el del Excel, revísalo</span>}
                        {w.detalle && <span style={{ display: 'block', color: w.estado === 'llenado' ? theme.textSecondary : '#b45309' }}>{w.detalle}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="complementarios-filtros" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', margin: '10px 0' }}>
            {FILTROS.map(([id, txt]) => {
              const n = id === 'todos' ? filas.length : cuenta(id);
              if (id !== 'todos' && !n && filtro !== id) return null;
              return (
                <button key={id} type="button" className={`chip-dato chip-filtro-lote ${filtro === id ? 'activo' : ''}`} onClick={() => { setFiltro(id); setPagina(1); }} aria-pressed={filtro === id}
                  style={{ backgroundColor: theme.subtleBg, borderColor: theme.border, color: theme.textPrimary }}>
                  {txt} <b>{n}</b>
                </button>
              );
            })}
            <label className="usuarios-buscar" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, marginLeft: 'auto' }}>
              <Search size={15} color={theme.textSecondary} />
              <input type="search" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar nombre, crédito o EXP.…" aria-label="Buscar en el Excel" style={{ color: theme.textPrimary }} />
              {busca && <button type="button" className="quitar-archivo" onClick={() => setBusca('')} aria-label="Limpiar búsqueda"><X size={13} /></button>}
            </label>
          </div>

          <div className="tabla-complementarios-scroll">
            <table className="tabla-tarjetas tabla-complementarios" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ color: theme.textSecondary, textAlign: 'left' }}>
                  <th style={{ width: 34 }}>
                    <input type="checkbox" aria-label="Marcar todos los que se ven"
                      checked={visiblesSel.length > 0 && visiblesSel.every((f) => elegidos[f.n])}
                      onChange={(e) => setElegidos((sel) => {
                        const n = { ...sel };
                        visiblesSel.forEach((f) => { if (e.target.checked) n[f.n] = n[f.n] || f.exp?.id; else delete n[f.n]; });
                        Object.keys(n).forEach((k) => { if (!n[k]) delete n[k]; });
                        return n;
                      })} />
                  </th>
                  <th>En el Excel</th>
                  <th>Datos a llenar</th>
                  <th>Expediente en el sistema</th>
                  <th style={{ width: 150 }}>Cotejo</th>
                </tr>
              </thead>
              <tbody>
                {enPagina.map((f) => {
                  const c = COTEJOS[f.cotejo] || COTEJOS.no_encontrado;
                  const sel = !!elegidos[f.n];
                  const puede = seleccionables(f) && (f.exp || elegidos[f.n] || f.cotejo === 'varios');
                  return (
                    <tr key={f.n} className={`fila-complementario ${sel ? 'marcada' : ''}`} style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: sel ? (isDarkMode ? '#0f1f3a' : '#f5f9ff') : 'transparent' }}>
                      <td data-etiqueta="">
                        <input type="checkbox" disabled={!puede || (f.cotejo === 'varios' && !elegidos[f.n])} checked={sel} onChange={() => alternar(f)} aria-label={`Llenar renglón ${f.n}`} />
                      </td>
                      <td data-etiqueta="En el Excel">
                        <div style={{ fontWeight: 600, color: theme.textPrimary }}>{f.nombre}</div>
                        <div style={{ color: theme.textSecondary }}>Crédito {f.credito || '—'} · renglón {f.n}</div>
                      </td>
                      <td data-etiqueta="Datos a llenar" style={{ color: theme.textPrimary }}>
                        <div>EXP. <b>{f.expediente || '—'}</b> · ESC <b>{f.escritura || '—'}</b></div>
                        <div>VOL. <b>{f.volumen || '—'}</b> · {f.fecha || '—'}</div>
                      </td>
                      <td data-etiqueta="Expediente">
                        {f.cotejo === 'varios' ? (
                          <Selector value={elegidos[f.n] || ''} onChange={(e) => alternar(f, e.target.value || null)} aria-label="Elegir expediente"
                            style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '12px', padding: '5px 8px', maxWidth: 280 }}>
                            <option value="">Elige el expediente…</option>
                            {(f.opciones || []).map((o) => <option key={o.id} value={o.id}>{o.nombre} · {o.credito} · {o.dueno}</option>)}
                          </Selector>
                        ) : f.exp ? (
                          <>
                            <div style={{ fontWeight: 600, color: theme.textPrimary }}>{f.exp.nombre || '(sin nombre)'}</div>
                            <div style={{ color: theme.textSecondary }}>Crédito {f.exp.credito} · de {f.exp.dueno} · {String(f.exp.estado || '').toLowerCase()}</div>
                            {f.cotejo === 'distinto' && f.exp.actuales && (
                              <div style={{ color: '#b91c1c', fontSize: '11.5px' }}>Ya tiene: EXP. {f.exp.actuales.comp_expediente || '—'} · ESC {f.exp.actuales.comp_escritura || '—'}</div>
                            )}
                          </>
                        ) : f.cotejo === 'llenado' ? (
                          <span style={{ color: theme.textSecondary }}>{f.word ? <>Llenado en su Word <b>{f.word}</b></> : 'Llenado'}{f.llenado_por ? ` por ${nombreUsuario(f.llenado_por, usuariosLista)}` : ''}{f.llenado_en ? ` · ${fechaCorta(f.llenado_en)}` : ''}</span>
                        ) : (
                          <span style={{ color: theme.textSecondary }}>No está en el sistema todavía</span>
                        )}
                      </td>
                      <td data-etiqueta="Cotejo">
                        <span className="chip-cotejo" title={c.detalle} style={{ color: c.color, backgroundColor: isDarkMode ? 'transparent' : c.fondo, borderColor: c.color }}>{c.texto}</span>
                      </td>
                    </tr>
                  );
                })}
                {!enPagina.length && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: theme.textSecondary }}>No hay renglones con ese filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {visibles.length > POR_PAGINA && (
            <nav className="paginacion-lote" aria-label="Páginas del Excel" style={{ borderColor: theme.border, color: theme.textSecondary }}>
              <span>{(pag - 1) * POR_PAGINA + 1}–{Math.min(pag * POR_PAGINA, visibles.length)} de {visibles.length}</span>
              <div className="paginacion-botones">
                <button type="button" onClick={() => setPagina(pag - 1)} disabled={pag === 1} aria-label="Página anterior" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronLeft size={15} /></button>
                <span style={{ padding: '0 6px' }}>{pag} / {totalPaginas}</span>
                <button type="button" onClick={() => setPagina(pag + 1)} disabled={pag === totalPaginas} aria-label="Página siguiente" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronRight size={15} /></button>
              </div>
            </nav>
          )}

          <div className="complementarios-acciones" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginTop: '14px' }}>
            <span style={{ fontSize: '12px', color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 260px' }}>
              <Info size={14} /> Los que no tienen expediente quedan pendientes: sube su Word arriba, o cuando alguien guarde ese expediente se llena solo.
            </span>
            {llenadosAhora.length > 0 && (
              <button type="button" className="boton-barra" disabled={descargandoZipIds} onClick={() => descargarZipIds(llenadosAhora, 'Datos_complementarios')}
                style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                {descargandoZipIds ? <Loader2 size={15} className="girando" /> : <Download size={15} />} Descargar Word de los llenados ({llenadosAhora.length})
              </button>
            )}
            <button type="button" className="boton-barra boton-llenar-complementarios" disabled={!nElegidos || llenando} onClick={llenar}
              style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
              {llenando ? <Loader2 size={15} className="girando" /> : <RefreshCw size={15} />} Llenar y regenerar ({nElegidos})
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

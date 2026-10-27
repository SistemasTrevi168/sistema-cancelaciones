import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown, CalendarDays, ChevronLeft, Pencil, ChevronRight, Download, Eye, FileStack, Filter, History, Inbox, ListChecks, Loader2, MessageSquareText, RefreshCw, RotateCcw, Search, Share2, ShieldAlert, Users, X,
} from 'lucide-react';
import { etiquetaCampo, revisarIncidencia } from '../datosFaltantes';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';
import EstadoExpediente from './EstadoExpediente';
import BitacoraExpediente from './BitacoraExpediente';
import { BotonObservaciones, ModalObservaciones } from './Observaciones';
import { textoObservaciones } from '../ui/observaciones';
import { ESTADOS, colorEstado } from '../estadosExpediente';
import usePresencia from '../ui/usarPresencia';
import Selector from './Selector';

const PERIODOS = [['all', 'Todo'], ['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['anio', 'Este año'], ['elegir', 'Elegir fecha…']];

export default function TabHistorial() {
  const {
    isDarkMode,
    formatearMonto,
    abrirVistaPrevia,
    selectedPlantilla,
    vistaPrevia,
    cargandoHistorial,
    descargandoId,
    filterPeriod,
    filteredHistorial,
    handleDownloadWord,
    plantillaGuardada,
    iniciarEdicionSingle,
    activeTab,
    abrirCompartir,
    puedeCompartir,
    handleExport,
    mesesNombres,
    parsearFechaExpediente,
    searchQuery,
    selectedDay,
    selectedMonth,
    selectedYear,
    setFilterPeriod,
    setSearchQuery,
    setSelectedDay,
    setSelectedMonth,
    setSelectedYear,
    setShowExportMenu,
    ordenHistorial,
    setOrdenHistorial,
    historial,
    showExportMenu,
    filtroEstado,
    setFiltroEstado,
    conteoEstados,
    cambiarEstado,
    puedeServidor,
    setModalCompletarPdfs,
    actualizarObservaciones,
    theme
  } = useApp();
  const [observando, setObservando] = useState(null); // expediente con la ventana de observaciones abierta
  const cerrarObservaciones = useCallback(() => setObservando(null), []);
  const exportar = usePresencia(showExportMenu, 150);
  const [bitacora, setBitacora] = useState(null); // { id, titulo, datos }

  // Marcados: se conservan al buscar, filtrar o cambiar de página (solo cuentan los que siguen en la lista)
  const [marcados, setMarcados] = useState({});    // id -> true
  const [verMarcados, setVerMarcados] = useState(false);
  const idDe = (item) => String(item.id || item.expediente_id);
  const existentes = new Set((historial || []).map(idDe));
  const marcadosIds = Object.keys(marcados).filter((i) => marcados[i] && existentes.has(i));
  const lista = verMarcados && marcadosIds.length ? (historial || []).filter((h) => marcados[idDe(h)]) : filteredHistorial;
  const visiblesIds = lista.map(idDe);
  const visiblesMarcados = visiblesIds.filter((i) => marcados[i]).length;
  const todosMarcados = visiblesIds.length > 0 && visiblesMarcados === visiblesIds.length;
  const fueraDeVista = marcadosIds.length - visiblesMarcados;
  const casilla = useRef(null);
  useEffect(() => { if (casilla.current) casilla.current.indeterminate = visiblesMarcados > 0 && !todosMarcados; });
  const alternarVisibles = () => setMarcados((m) => {
    const nuevo = { ...m };
    visiblesIds.forEach((i) => { if (todosMarcados) delete nuevo[i]; else nuevo[i] = true; });
    return nuevo;
  });
  const quitarMarcas = () => { setMarcados({}); setVerMarcados(false); };
  // Años con expedientes (para «Elegir fecha»)
  const anios = [...new Set([new Date().getFullYear(), ...(historial || []).map((h) => parsearFechaExpediente(h)?.year).filter(Boolean)])].sort((a, b) => b - a);
  const hayFiltros = !!searchQuery || filterPeriod !== 'all' || filtroEstado !== 'todos';
  const limpiarFiltros = () => { setSearchQuery(''); setFilterPeriod('all'); setFiltroEstado('todos'); setSelectedMonth('all'); setSelectedDay('all'); };
  if (verMarcados && marcadosIds.length === 0) setVerMarcados(false);
  const totalEstados = Object.entries(conteoEstados || {}).filter(([k]) => k !== 'INCIDENCIA').reduce((a, [, b]) => a + b, 0);
  const cerrarBitacora = useCallback(() => setBitacora(null), []);

  // Paginación: 15 expedientes por página; al cambiar la búsqueda o los filtros se regresa a la primera
  const POR_PAGINA = 15;
  const [pagina, setPagina] = useState(1);
  const claveFiltros = JSON.stringify([searchQuery, filterPeriod, selectedYear, selectedMonth, selectedDay, filtroEstado, ordenHistorial, verMarcados]);
  const [filtrosAnteriores, setFiltrosAnteriores] = useState(claveFiltros);
  if (claveFiltros !== filtrosAnteriores) { setFiltrosAnteriores(claveFiltros); setPagina(1); }
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const filasPagina = lista.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  const irAPagina = (n) => {
    setPagina(Math.min(Math.max(1, n), totalPaginas));
    document.getElementById('tabla-historial-export')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // «Compartidos conmigo»: la misma lista, con los expedientes que otras personas me compartieron
  const enCompartidos = activeTab === 'compartidos';
  const nombresDe = (lista) => (lista || []).map((g) => g.nombre || g.usuario).join(', ');
  const marcarVarios = async (estado) => {
    if (await cambiarEstado(marcadosIds, estado)) quitarMarcas();
  };

  return (
<div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {enCompartidos
                    ? <><Inbox size={20} color={theme.accent} /> Compartidos conmigo</>
                    : <><History size={20} color={theme.accent} /> Historial de Expedientes</>}
                </h2>
                {!enCompartidos && puedeServidor('documentos') && (
                  <button type="button" className="boton-barra" onClick={() => setModalCompletarPdfs(true)} title="Subir los PDF de expedientes que se guardaron antes (se juntan por número de crédito)"
                    style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                    <FileStack size={15} color="#0891b2" /> Subir PDF de anteriores
                  </button>
                )}
                {!enCompartidos && puedeCompartir && (
                  <button type="button" className="boton-barra" onClick={() => abrirCompartir({ todos: true })} title="Dar acceso a TODOS tus expedientes (también a los que hagas después)"
                    style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                    <Users size={15} color={theme.accent} /> Compartir todos mis expedientes
                  </button>
                )}
                
              </div>

              {/* FILTROS: búsqueda y orden · periodo · estado */}
              <div className="historial-filtros-panel" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg }}>
                <div className="hf-fila hf-principal">
                  <label className="hf-buscar" style={{ borderColor: theme.border, backgroundColor: theme.inputBg }}>
                    <Search size={16} color={theme.textSecondary} />
                    <input
                      type="text"
                      placeholder="Buscar por nombre, crédito, folio, carta u observaciones…"
                      aria-label="Buscar en el historial"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ color: theme.textPrimary }}
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda" className="buscar-limpiar" style={{ color: theme.textSecondary }}><X size={14} /></button>
                    )}
                  </label>
                  <label className="hf-orden" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}>
                    <ArrowUpDown size={14} color={theme.textSecondary} />
                    <span className="hf-orden-texto" style={{ color: theme.textSecondary }}>Ordenar:</span>
                    <Selector value={ordenHistorial} onChange={(e) => setOrdenHistorial(e.target.value)} aria-label="Ordenar"
                      style={{ border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', fontWeight: 600, padding: '8px 0', cursor: 'pointer' }}>
                      <option value="az">Nombre A-Z</option>
                      <option value="za">Nombre Z-A</option>
                      <option value="reciente">Más recientes</option>
                      <option value="antiguo">Más antiguos</option>
                    </Selector>
                  </label>
                </div>

                <div className="hf-fila">
                  <span className="hf-etiqueta" style={{ color: theme.textSecondary }}><CalendarDays size={14} /> Periodo</span>
                  <div className="hf-segmentos" role="radiogroup" aria-label="Periodo" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
                    {PERIODOS.map(([id, nombre]) => (
                      <button key={id} type="button" role="radio" aria-checked={filterPeriod === id}
                        className={`hf-segmento ${filterPeriod === id ? 'activo' : ''}`}
                        onClick={() => setFilterPeriod(id)}
                        style={filterPeriod === id ? { backgroundColor: theme.accent, color: '#fff' } : { color: theme.textSecondary }}>
                        {nombre}
                      </button>
                    ))}
                  </div>
                  {filterPeriod === 'elegir' && (
                    <div className="hf-fecha">
                      <Selector value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} aria-label="Año"
                        style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '7px 8px', cursor: 'pointer' }}>
                        {anios.map((y) => <option key={y} value={y}>{y}</option>)}
                      </Selector>
                      <Selector value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); if (e.target.value === 'all') setSelectedDay('all'); }} aria-label="Mes"
                        style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '7px 8px', cursor: 'pointer' }}>
                        <option value="all">Todo el año</option>
                        {mesesNombres.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                      </Selector>
                      {selectedMonth !== 'all' && (
                        <Selector value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} aria-label="Día"
                          style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '7px 8px', cursor: 'pointer' }}>
                          <option value="all">Todo el mes</option>
                          {Array.from({ length: new Date(Number(selectedYear), Number(selectedMonth) + 1, 0).getDate() }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>Día {d}</option>
                          ))}
                        </Selector>
                      )}
                    </div>
                  )}
                </div>

                <div className="hf-fila">
                  <span className="hf-etiqueta" style={{ color: theme.textSecondary }}><Filter size={14} /> Estado</span>
                  <div className="filtro-estados hf-estados" role="tablist" aria-label="Filtrar por estado">
                    {[{ id: 'todos', nombre: 'Todos' }, ...ESTADOS].map((e) => {
                      const activo = filtroEstado === e.id;
                      const n = e.id === 'todos' ? totalEstados : (conteoEstados?.[e.id] || 0);
                      const c = e.id === 'todos' ? null : colorEstado(e.id, isDarkMode);
                      const Icono = e.icono;
                      return (
                        <button key={e.id} type="button" role="tab" aria-selected={activo} onClick={() => setFiltroEstado(e.id)}
                          className={`filtro-estado ${activo ? 'activo' : ''}`}
                          style={activo
                            ? (c ? { ...c, boxShadow: `0 0 0 2px ${c.borderColor}` } : { backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent })
                            : { backgroundColor: theme.cardBg, color: theme.textSecondary, borderColor: theme.border }}>
                          {Icono && <Icono size={14} />} {e.nombre} <span className="filtro-estado-n">{n}</span>
                        </button>
                      );
                    })}
                    {(conteoEstados?.INCIDENCIA > 0 || filtroEstado === 'INCIDENCIA') && (
                      <button type="button" role="tab" aria-selected={filtroEstado === 'INCIDENCIA'} onClick={() => setFiltroEstado('INCIDENCIA')}
                        className={`filtro-estado filtro-incidencia ${filtroEstado === 'INCIDENCIA' ? 'activo' : ''}`}
                        title="Expedientes que no pueden pasar a firma: les falta el notario de origen, o el número y la fecha de la escritura">
                        <ShieldAlert size={14} /> Incidencias <span className="filtro-estado-n">{conteoEstados?.INCIDENCIA || 0}</span>
                      </button>
                    )}
                  </div>
                </div>
                {hayFiltros && (
                  <div className="hf-activos" style={{ borderColor: theme.border, color: theme.textSecondary }}>
                    <span>Mostrando <strong style={{ color: theme.textPrimary }}>{filteredHistorial.length}</strong> de {(historial || []).length} expedientes</span>
                    <button type="button" className="enlace-pequeno" onClick={limpiarFiltros} style={{ color: theme.accent }}><RotateCcw size={13} /> Limpiar filtros</button>
                  </div>
                )}
              </div>

              {marcadosIds.length > 0 && (
                <div className="barra-marcados" style={{ borderColor: theme.accent, backgroundColor: `${theme.accent}12`, color: theme.textPrimary }}>
                  <ListChecks size={16} color={theme.accent} />
                  <strong>{marcadosIds.length} marcado(s)</strong>
                  {fueraDeVista > 0 && !verMarcados && (
                    <span className="marcados-fuera" style={{ color: theme.textSecondary }} title="Se conservan aunque no se vean con esta búsqueda o filtro">
                      ({fueraDeVista} fuera de esta búsqueda)
                    </span>
                  )}
                  <button type="button" className={`chip-ver-marcados ${verMarcados ? 'activo' : ''}`} onClick={() => setVerMarcados((v) => !v)}
                    style={verMarcados ? { backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent } : { backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                    <Eye size={13} /> {verMarcados ? 'Ver toda la lista' : 'Ver solo marcados'}
                  </button>
                  <span style={{ color: theme.textSecondary }}>Marcar como:</span>
                  {ESTADOS.map((e) => {
                    const Icono = e.icono;
                    return (
                      <button key={e.id} type="button" className="chip-estado" style={colorEstado(e.id, isDarkMode)} onClick={() => marcarVarios(e.id)}>
                        <Icono size={13} /> {e.nombre}
                      </button>
                    );
                  })}
                  {!enCompartidos && puedeCompartir && (
                    <button type="button" className="boton-barra boton-compartir" onClick={() => abrirCompartir({ ids: marcadosIds, onListo: quitarMarcas })}>
                      <Share2 size={14} /> Compartir ({marcadosIds.length})
                    </button>
                  )}
                  <button type="button" className="enlace-pequeno" onClick={quitarMarcas} style={{ marginLeft: 'auto' }}>Quitar marcas</button>
                </div>
              )}

              {/* BARRA DE CONTEO Y BOTÓN GLOBAL DE EXPORTACIÓN */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: theme.subtleBg, borderRadius: '8px', marginBottom: '16px', border: `1px solid ${theme.border}`, flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: '600' }}>
                  {verMarcados ? 'Marcados' : 'Total encontrados'}: <span style={{ color: theme.accent, fontSize: '15px', fontWeight: '700' }}>{lista.length}</span> expedientes
                </div>

                {/* MENÚ DESPLEGABLE GLOBAL DE EXPORTACIÓN */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, border: `1px solid ${theme.border}`, padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Download size={14} color={theme.accent} />
                    Exportar Reporte
                    <span className={`flecha-menu ${showExportMenu ? 'abierta' : ''}`} style={{ fontSize: '10px' }}>▼</span>
                  </button>

                  {exportar.montado && (
                    <div className={`menu-exportar ${exportar.saliendo ? 'saliendo' : ''}`} style={{ position: 'absolute', right: 0, top: '110%', backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: '10px', boxShadow: '0 10px 24px rgba(0,0,0,0.15)', zIndex: 100, minWidth: '220px', overflow: 'hidden', padding: '6px' }}>
                      {[
                        ['csv', 'csv', 'Excel', '.csv'],
                        ['word', 'doc', 'Word', '.doc'],
                        ['txt', 'txt', 'Texto', '.txt'],
                        ['image', 'png', 'Imagen', '.png'],
                        ['print', 'pdf', 'Imprimir / PDF', ''],
                      ].map(([formato, icono, etiqueta, ext]) => (
                        <button
                          key={formato}
                          onClick={() => handleExport(formato)}
                          className="opcion-exportar"
                          style={{ width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', borderRadius: '8px', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                        >
                          <IconoArchivo tipo={icono} size={24} />
                          <span style={{ fontWeight: 600 }}>{etiqueta}</span>
                          {ext && <span style={{ marginLeft: 'auto', color: theme.textSecondary, fontSize: '12px' }}>{ext}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {cargandoHistorial && lista.length === 0 ? (
                <div aria-busy="true" style={{ padding: '8px' }}>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <div key={n} className="esqueleto" style={{ height: '44px', borderRadius: '8px', marginBottom: '10px', opacity: 1 - n * 0.15 }} />
                  ))}
                </div>
              ) : lista.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.textSecondary, fontSize: '14px' }}>
                  {enCompartidos && totalEstados === 0 && !searchQuery
                    ? <><Inbox size={28} color={theme.accent} style={{ display: 'block', margin: '0 auto 8px' }} />Todavía nadie te ha compartido expedientes. Cuando te den acceso, aparecerán aquí.</>
                    : 'No se encontraron expedientes con los criterios seleccionados.'}
                </div>
              ) : (
                <div id="tabla-historial-export" style={{ overflowX: 'auto', backgroundColor: theme.cardBg, padding: '8px', borderRadius: '8px' }}>
                  <table className="tabla-tarjetas" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '12px 4px 12px 12px', width: '28px' }} className="celda-marca">
                          <input ref={casilla} type="checkbox" aria-label="Marcar todos los de esta lista" title="Marcar o desmarcar todos los de esta lista" checked={todosMarcados}
                            onChange={alternarVisibles} />
                        </th>
                        <th style={{ padding: '12px' }}>Acreditado</th>
                        <th style={{ padding: '12px' }}>No. Crédito</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Monto</th>
                        <th style={{ padding: '12px' }}>Fecha</th>
                        <th className="col-hora" style={{ padding: '12px' }}>Hora</th>
                        <th style={{ padding: '12px' }}>Estado</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasPagina.map((item, idx) => {
                        const dExtra = item.datos_extraidos || {};
                        const nombre = dExtra.acreditado || dExtra.nombre_acreditado || item.nombre_acreditado || 'N/A';
                        const numCred = dExtra.numero_credito || item.numero_credito || 'N/A';
                        
                        const parsed = parsearFechaExpediente(item);
                        const fechaStr = parsed ? parsed.fechaTexto : (item.created_at || item.fecha || 'Sin fecha');
                        const horaStr = parsed ? parsed.horaTexto : (item.hora || '—');
                        const montoStr = formatearMonto(dExtra.monto_credito || item.monto);

                        return (
                          <tr key={idDe(item) || idx} className={`fila-historial ${marcados[idDe(item)] ? 'marcada' : ''}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td className="celda-marca" style={{ padding: '12px 4px 12px 12px' }}>
                              <input type="checkbox" aria-label={`Marcar ${nombre}`} checked={!!marcados[idDe(item)]}
                                onChange={() => setMarcados((m) => ({ ...m, [idDe(item)]: !m[idDe(item)] }))} />
                            </td>
                            <td className="celda-titulo" style={{ padding: '12px', fontWeight: '600', color: theme.textPrimary }}>
                              {nombre}
                              {enCompartidos && item.compartido_por && (
                                <span className="chip-compartido-por" title={`${item.compartido_por} te compartió este expediente`}>
                                  <Share2 size={11} /> de {item.compartido_por}
                                </span>
                              )}
                              {!enCompartidos && item.compartido_con?.length > 0 && (
                                <button type="button" className="chip-compartido" onClick={() => puedeCompartir && abrirCompartir({ ids: [idDe(item)], titulo: nombre })}
                                  title={`Compartido con: ${nombresDe(item.compartido_con)}${puedeCompartir ? '\nClic para ver o quitar el acceso' : ''}`}>
                                  <Users size={11} /> Compartido ({item.compartido_con.length})
                                </button>
                              )}
                              {(() => {
                                const inc = revisarIncidencia(dExtra);
                                return inc.incidencia && (
                                  <span className="chip-incidencia" title={`${inc.motivo}. No puede pasar a firma hasta completar: ${inc.faltan.map(etiquetaCampo).join(', ')}.`}>
                                    <ShieldAlert size={11} /> Incidencia
                                  </span>
                                );
                              })()}
                              {textoObservaciones(item) && (
                                <button type="button" className="observacion-en-fila" onClick={() => setObservando(item)} title={`Observaciones:\n${textoObservaciones(item)}\n\nClic para verlas o cambiarlas`}
                                  style={{ color: theme.textSecondary }}>
                                  <MessageSquareText size={12} color="#a16207" />
                                  <span>{textoObservaciones(item)}</span>
                                </button>
                              )}
                              {item.plantilla_cambio && (
                                <span className="chip-plantilla-cambio" title="La plantilla cambió después de generar este Word. Se sigue descargando con la versión original; en el historial de cambios puedes descargarlo con la plantilla actual.">
                                  <RefreshCw size={11} /> Plantilla actualizada
                                </span>
                              )}
                            </td>
                            <td data-etiqueta="Crédito" style={{ padding: '12px', color: theme.textSecondary }}>{numCred}</td>
                            <td style={{ padding: '12px', color: montoStr === '—' ? theme.textSecondary : (isDarkMode ? '#34d399' : '#059669'), fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} data-etiqueta="Monto">{montoStr}</td>
                            <td data-etiqueta="Fecha" style={{ padding: '12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{fechaStr}<small className="hora-en-fecha">{horaStr}</small></td>
                            <td data-etiqueta="Hora" className="col-hora" style={{ padding: '12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{horaStr}</td>
                            <td data-etiqueta="Estado" style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                              <EstadoExpediente id={idDe(item)} estado={item.estado || 'GENERADO'} />
                            </td>
                            <td className="celda-acciones" style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div className="acciones-historial">
                              <button
                                onClick={async () => abrirVistaPrevia({
                                  origen: 'historial',
                                  id: item.id || item.expediente_id,
                                  datos: dExtra,
                                  // La plantilla con la que se guardó (nunca la que esté elegida en otra pantalla)
                                  plantilla: dExtra.plantilla_seleccionada || dExtra.plantilla
                                    || (await plantillaGuardada(item.id || item.expediente_id)) || selectedPlantilla,
                                  titulo: nombre,
                                })}
                                title="Vista previa"
                                aria-label={`Vista previa de ${nombre}`}
                                className="accion-icono" style={{ backgroundColor: vistaPrevia?.id === (item.id || item.expediente_id) ? theme.accent : theme.subtleBg, color: vistaPrevia?.id === (item.id || item.expediente_id) ? '#fff' : theme.textPrimary, borderColor: theme.border }}
                              >
                                <Eye size={15} />
                              </button>
                              {puedeServidor('actualizar_existente') && <button
                                type="button"
                                onClick={() => iniciarEdicionSingle(item)}
                                title="Editar expediente"
                                aria-label={`Editar ${nombre}`}
                                className="accion-icono" style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary, borderColor: theme.border }}
                              >
                                <Pencil size={15} />
                              </button>}
                              {puedeServidor('observaciones') && <BotonObservaciones expediente={item} onAbrir={setObservando} className="accion-icono" />}
                              <button
                                type="button"
                                onClick={() => setBitacora({ id: idDe(item), titulo: nombre, datos: dExtra })}
                                title="Historial de cambios"
                                aria-label={`Historial de cambios de ${nombre}`}
                                className="accion-icono" style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary, borderColor: theme.border }}
                              >
                                <History size={15} />
                              </button>
                              <button
                                onClick={() => handleDownloadWord(item.id || item.expediente_id, dExtra, dExtra.plantilla_seleccionada || dExtra.plantilla)}
                                disabled={descargandoId === (item.id || item.expediente_id)}
                                className="accion-descargar" title="Descargar el Word" aria-label={`Descargar el Word de ${nombre}`} style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary, borderColor: theme.border }}
                              >
                                {descargandoId === (item.id || item.expediente_id) ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="docx" size={17} />} <span className="accion-descargar-texto">Descargar</span>
                              </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {lista.length > POR_PAGINA && (
                    <nav className="paginacion-lote" aria-label="Páginas del historial" style={{ borderColor: theme.border, color: theme.textSecondary }}>
                      <span>{(paginaVista - 1) * POR_PAGINA + 1}–{Math.min(paginaVista * POR_PAGINA, lista.length)} de {lista.length} expedientes</span>
                      <div className="paginacion-botones">
                        <button type="button" onClick={() => irAPagina(paginaVista - 1)} disabled={paginaVista === 1} aria-label="Página anterior" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronLeft size={15} /></button>
                        {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                          .filter((n) => n === 1 || n === totalPaginas || Math.abs(n - paginaVista) <= 1)
                          .map((n, i, lista) => (
                            <span key={n} style={{ display: 'contents' }}>
                              {i > 0 && n - lista[i - 1] > 1 && <span className="paginacion-puntos">…</span>}
                              <button type="button" onClick={() => irAPagina(n)} aria-current={n === paginaVista ? 'page' : undefined}
                                style={{ borderColor: n === paginaVista ? theme.accent : theme.border, backgroundColor: n === paginaVista ? theme.accent : theme.cardBg, color: n === paginaVista ? '#fff' : theme.textPrimary }}>
                                {n}
                              </button>
                            </span>
                          ))}
                        <button type="button" onClick={() => irAPagina(paginaVista + 1)} disabled={paginaVista === totalPaginas} aria-label="Página siguiente" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronRight size={15} /></button>
                      </div>
                      <span />
                    </nav>
                  )}
                </div>
              )}
              {observando && (
                <ModalObservaciones expediente={observando} onCerrar={cerrarObservaciones} onGuardado={(id, obs) => actualizarObservaciones(id, obs)} />
              )}
              {bitacora && (
                <BitacoraExpediente expedienteId={bitacora.id} titulo={bitacora.titulo} datos={bitacora.datos} onCerrar={cerrarBitacora} />
              )}
            </div>
  );
}


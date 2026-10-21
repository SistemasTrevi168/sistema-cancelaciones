import { useCallback, useState } from 'react';
import {
  ArrowUpDown, ChevronLeft, Pencil, ChevronRight, Download, Eye, Filter, History, ListChecks, Loader2, RefreshCw, Search, X,
} from 'lucide-react';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';
import EstadoExpediente from './EstadoExpediente';
import BitacoraExpediente from './BitacoraExpediente';
import EditarExpediente from './EditarExpediente';
import { ESTADOS, colorEstado } from '../estadosExpediente';
import usePresencia from '../ui/usarPresencia';
import Selector from './Selector';

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
    setSortAscending,
    showExportMenu,
    sortAscending,
    filtroEstado,
    setFiltroEstado,
    conteoEstados,
    cambiarEstado,
    setUnlockedFields,
    puedeServidor,
    theme
  } = useApp();
  const exportar = usePresencia(showExportMenu, 150);
  const [bitacora, setBitacora] = useState(null); // { id, titulo, datos }
  const [editando, setEditando] = useState(null);  // expediente que se está editando
  const abrirEdicion = (item) => {
    const id = idDe(item);
    // Al editar, todos los datos quedan abiertos (sin candado)
    setUnlockedFields((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(item.datos_extraidos || {}).map((k) => [`editar_${id}_${k}`, true])) }));
    setEditando(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [marcados, setMarcados] = useState({});    // id -> true
  const idDe = (item) => String(item.id || item.expediente_id);
  const visiblesIds = filteredHistorial.map(idDe);
  const marcadosIds = visiblesIds.filter((i) => marcados[i]);
  const todosMarcados = visiblesIds.length > 0 && marcadosIds.length === visiblesIds.length;
  const totalEstados = Object.values(conteoEstados || {}).reduce((a, b) => a + b, 0);
  const cerrarBitacora = useCallback(() => setBitacora(null), []);

  // Paginación: 15 expedientes por página; al cambiar la búsqueda o los filtros se regresa a la primera
  const POR_PAGINA = 15;
  const [pagina, setPagina] = useState(1);
  const claveFiltros = JSON.stringify([searchQuery, filterPeriod, selectedYear, selectedMonth, selectedDay, filtroEstado, sortAscending]);
  const [filtrosAnteriores, setFiltrosAnteriores] = useState(claveFiltros);
  if (claveFiltros !== filtrosAnteriores) { setFiltrosAnteriores(claveFiltros); setPagina(1); }
  const totalPaginas = Math.max(1, Math.ceil(filteredHistorial.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const filasPagina = filteredHistorial.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  const irAPagina = (n) => {
    setPagina(Math.min(Math.max(1, n), totalPaginas));
    document.getElementById('tabla-historial-export')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const marcarVarios = async (estado) => {
    if (await cambiarEstado(marcadosIds, estado)) setMarcados({});
  };

  if (editando) {
    return <EditarExpediente key={idDe(editando)} item={editando} onCerrar={() => setEditando(null)} />;
  }

  return (
<div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={20} color={theme.accent} /> Historial de Expedientes
                </h2>
                
                <div className="historial-filtros" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Búsqueda por texto */}
                  <div className="historial-buscar" style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '0 10px', backgroundColor: theme.inputBg }}>
                    <Search size={16} color={theme.textSecondary} />
                    <input
                      type="text"
                      placeholder="Buscar nombre, crédito, folio o carta…"
                      aria-label="Buscar en el historial por nombre, crédito, folio o número de carta"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ padding: '8px', border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', width: '250px', outline: 'none' }}
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda" className="buscar-limpiar" style={{ color: theme.textSecondary }}><X size={14} /></button>
                    )}
                  </div>

                  {/* Selector de Periodo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '0 8px', backgroundColor: theme.inputBg }}>
                    <Filter size={14} color={theme.textSecondary} />
                    <Selector
                      value={filterPeriod}
                      onChange={(e) => setFilterPeriod(e.target.value)}
                      style={{ border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', padding: '8px 0', cursor: 'pointer' }}
                    >
                      <option value="all">Todo el historial</option>
                      <option value="day">Por Día</option>
                      <option value="month">Por Mes</option>
                      <option value="year">Por Año</option>
                    </Selector>
                  </div>

                  {/* Filtro Dinámico: Año */}
                  {filterPeriod !== 'all' && (
                    <Selector
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </Selector>
                  )}

                  {/* Filtro Dinámico: Mes */}
                  {(filterPeriod === 'day' || filterPeriod === 'month') && (
                    <Selector
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      {mesesNombres.map((m, idx) => (
                        <option key={idx} value={idx}>{m}</option>
                      ))}
                    </Selector>
                  )}

                  {/* Filtro Dinámico: Día */}
                  {filterPeriod === 'day' && (
                    <Selector
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      <option value="all">Todos los días</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>Día {d}</option>
                      ))}
                    </Selector>
                  )}

                  {/* Orden A-Z / Z-A */}
                  <button
                    onClick={() => setSortAscending(!sortAscending)}
                    title={sortAscending ? 'Orden A-Z' : 'Orden Z-A'}
                    style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                  >
                    <ArrowUpDown size={14} />
                    {sortAscending ? 'A-Z' : 'Z-A'}
                  </button>
                </div>
              </div>

              {/* FILTRO POR ESTADO */}
              <div className="filtro-estados" role="tablist" aria-label="Filtrar por estado">
                {[{ id: 'todos', nombre: 'Todos' }, ...ESTADOS].map((e) => {
                  const activo = filtroEstado === e.id;
                  const n = e.id === 'todos' ? totalEstados : (conteoEstados?.[e.id] || 0);
                  const c = e.id === 'todos' ? null : colorEstado(e.id, isDarkMode);
                  const Icono = e.icono;
                  return (
                    <button key={e.id} type="button" role="tab" aria-selected={activo} onClick={() => { setFiltroEstado(e.id); setMarcados({}); }}
                      className={`filtro-estado ${activo ? 'activo' : ''}`}
                      style={activo
                        ? (c ? { ...c, boxShadow: `0 0 0 2px ${c.borderColor}` } : { backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent })
                        : { backgroundColor: theme.cardBg, color: theme.textSecondary, borderColor: theme.border }}>
                      {Icono && <Icono size={14} />} {e.nombre} <span className="filtro-estado-n">{n}</span>
                    </button>
                  );
                })}
              </div>

              {marcadosIds.length > 0 && (
                <div className="barra-marcados" style={{ borderColor: theme.accent, backgroundColor: `${theme.accent}12`, color: theme.textPrimary }}>
                  <ListChecks size={16} color={theme.accent} />
                  <strong>{marcadosIds.length} marcado(s)</strong>
                  <span style={{ color: theme.textSecondary }}>Marcar como:</span>
                  {ESTADOS.map((e) => {
                    const Icono = e.icono;
                    return (
                      <button key={e.id} type="button" className="chip-estado" style={colorEstado(e.id, isDarkMode)} onClick={() => marcarVarios(e.id)}>
                        <Icono size={13} /> {e.nombre}
                      </button>
                    );
                  })}
                  <button type="button" className="enlace-pequeno" onClick={() => setMarcados({})} style={{ marginLeft: 'auto' }}>Quitar marcas</button>
                </div>
              )}

              {/* BARRA DE CONTEO Y BOTÓN GLOBAL DE EXPORTACIÓN */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: theme.subtleBg, borderRadius: '8px', marginBottom: '16px', border: `1px solid ${theme.border}`, flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: '600' }}>
                  Total encontrados: <span style={{ color: theme.accent, fontSize: '15px', fontWeight: '700' }}>{filteredHistorial.length}</span> expedientes
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
              
              {cargandoHistorial && filteredHistorial.length === 0 ? (
                <div aria-busy="true" style={{ padding: '8px' }}>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <div key={n} className="esqueleto" style={{ height: '44px', borderRadius: '8px', marginBottom: '10px', opacity: 1 - n * 0.15 }} />
                  ))}
                </div>
              ) : filteredHistorial.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.textSecondary, fontSize: '14px' }}>
                  No se encontraron expedientes con los criterios seleccionados.
                </div>
              ) : (
                <div id="tabla-historial-export" style={{ overflowX: 'auto', backgroundColor: theme.cardBg, padding: '8px', borderRadius: '8px' }}>
                  <table className="tabla-tarjetas" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '12px 4px 12px 12px', width: '28px' }} className="celda-marca">
                          <input type="checkbox" aria-label="Marcar todos" checked={todosMarcados}
                            onChange={() => setMarcados(todosMarcados ? {} : Object.fromEntries(visiblesIds.map((i) => [i, true])))} />
                        </th>
                        <th style={{ padding: '12px' }}>Acreditado</th>
                        <th style={{ padding: '12px' }}>No. Crédito</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Monto</th>
                        <th style={{ padding: '12px' }}>Fecha</th>
                        <th style={{ padding: '12px' }}>Hora</th>
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
                              {item.plantilla_cambio && (
                                <span className="chip-plantilla-cambio" title="La plantilla cambió después de generar este Word. Se sigue descargando con la versión original; en el historial de cambios puedes descargarlo con la plantilla actual.">
                                  <RefreshCw size={11} /> Plantilla actualizada
                                </span>
                              )}
                            </td>
                            <td data-etiqueta="Crédito" style={{ padding: '12px', color: theme.textSecondary }}>{numCred}</td>
                            <td style={{ padding: '12px', color: montoStr === '—' ? theme.textSecondary : (isDarkMode ? '#34d399' : '#059669'), fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} data-etiqueta="Monto">{montoStr}</td>
                            <td data-etiqueta="Fecha" style={{ padding: '12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{fechaStr}</td>
                            <td data-etiqueta="Hora" style={{ padding: '12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{horaStr}</td>
                            <td data-etiqueta="Estado" style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                              <EstadoExpediente id={idDe(item)} estado={item.estado || 'GENERADO'} />
                            </td>
                            <td className="celda-acciones" style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div className="acciones-historial">
                              <button
                                onClick={() => abrirVistaPrevia({
                                  origen: 'historial',
                                  id: item.id || item.expediente_id,
                                  datos: dExtra,
                                  plantilla: dExtra.plantilla_seleccionada || dExtra.plantilla || selectedPlantilla,
                                  titulo: nombre,
                                })}
                                title="Vista previa"
                                aria-label={`Vista previa de ${nombre}`}
                                className="accion-icono" style={{ backgroundColor: vistaPrevia?.id === (item.id || item.expediente_id) ? theme.accent : theme.subtleBg, color: vistaPrevia?.id === (item.id || item.expediente_id) ? '#fff' : theme.textPrimary, borderColor: theme.border }}
                              >
                                <Eye size={15} />
                              </button>
                              {puedeServidor('editar_expediente') && <button
                                type="button"
                                onClick={() => abrirEdicion(item)}
                                title="Editar expediente"
                                aria-label={`Editar ${nombre}`}
                                className="accion-icono" style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary, borderColor: theme.border }}
                              >
                                <Pencil size={15} />
                              </button>}
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
                                className="accion-descargar" style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary, borderColor: theme.border }}
                              >
                                {descargandoId === (item.id || item.expediente_id) ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="docx" size={17} />} Descargar
                              </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredHistorial.length > POR_PAGINA && (
                    <nav className="paginacion-lote" aria-label="Páginas del historial" style={{ borderColor: theme.border, color: theme.textSecondary }}>
                      <span>{(paginaVista - 1) * POR_PAGINA + 1}–{Math.min(paginaVista * POR_PAGINA, filteredHistorial.length)} de {filteredHistorial.length} expedientes</span>
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
              {bitacora && (
                <BitacoraExpediente expedienteId={bitacora.id} titulo={bitacora.titulo} datos={bitacora.datos} onCerrar={cerrarBitacora} />
              )}
            </div>
  );
}


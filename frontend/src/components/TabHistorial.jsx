import {
  ArrowUpDown, Download, Eye, Filter, History, Loader2, Search,
} from 'lucide-react';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';

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
    theme
  } = useApp();

  return (
<div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={20} color={theme.accent} /> Historial de Expedientes
                </h2>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Búsqueda por texto */}
                  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '0 10px', backgroundColor: theme.inputBg }}>
                    <Search size={16} color={theme.textSecondary} />
                    <input
                      type="text"
                      placeholder="Buscar por acreditado o crédito..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ padding: '8px', border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', width: '200px' }}
                    />
                  </div>

                  {/* Selector de Periodo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '0 8px', backgroundColor: theme.inputBg }}>
                    <Filter size={14} color={theme.textSecondary} />
                    <select
                      value={filterPeriod}
                      onChange={(e) => setFilterPeriod(e.target.value)}
                      style={{ border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', padding: '8px 0', cursor: 'pointer' }}
                    >
                      <option value="all">Todo el historial</option>
                      <option value="day">Por Día</option>
                      <option value="month">Por Mes</option>
                      <option value="year">Por Año</option>
                    </select>
                  </div>

                  {/* Filtro Dinámico: Año */}
                  {filterPeriod !== 'all' && (
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  )}

                  {/* Filtro Dinámico: Mes */}
                  {(filterPeriod === 'day' || filterPeriod === 'month') && (
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      {mesesNombres.map((m, idx) => (
                        <option key={idx} value={idx}>{m}</option>
                      ))}
                    </select>
                  )}

                  {/* Filtro Dinámico: Día */}
                  {filterPeriod === 'day' && (
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      <option value="all">Todos los días</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>Día {d}</option>
                      ))}
                    </select>
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
                    <span style={{ fontSize: '10px' }}>▼</span>
                  </button>

                  {showExportMenu && (
                    <div className="menu-exportar" style={{ position: 'absolute', right: 0, top: '110%', backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: '10px', boxShadow: '0 10px 24px rgba(0,0,0,0.15)', zIndex: 100, minWidth: '220px', overflow: 'hidden', padding: '6px' }}>
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
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '12px' }}>Acreditado</th>
                        <th style={{ padding: '12px' }}>No. Crédito</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Monto</th>
                        <th style={{ padding: '12px' }}>Fecha</th>
                        <th style={{ padding: '12px' }}>Hora</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistorial.map((item, idx) => {
                        const dExtra = item.datos_extraidos || {};
                        const nombre = dExtra.acreditado || dExtra.nombre_acreditado || item.nombre_acreditado || 'N/A';
                        const numCred = dExtra.numero_credito || item.numero_credito || 'N/A';
                        
                        const parsed = parsearFechaExpediente(item);
                        const fechaStr = parsed ? parsed.fechaTexto : (item.created_at || item.fecha || 'Sin fecha');
                        const horaStr = parsed ? parsed.horaTexto : (item.hora || '—');
                        const montoStr = formatearMonto(dExtra.monto_credito || item.monto);

                        return (
                          <tr key={idx} className="fila-historial" style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '12px', fontWeight: '600', color: theme.textPrimary }}>{nombre}</td>
                            <td style={{ padding: '12px', color: theme.textSecondary }}>{numCred}</td>
                            <td style={{ padding: '12px', color: montoStr === '—' ? theme.textSecondary : (isDarkMode ? '#34d399' : '#059669'), fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{montoStr}</td>
                            <td style={{ padding: '12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{fechaStr}</td>
                            <td style={{ padding: '12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{horaStr}</td>
                            <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
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
                                style={{ backgroundColor: vistaPrevia?.id === (item.id || item.expediente_id) ? theme.accent : theme.subtleBg, color: vistaPrevia?.id === (item.id || item.expediente_id) ? '#fff' : theme.textPrimary, border: `1px solid ${theme.border}`, padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', marginRight: '6px', verticalAlign: 'middle' }}
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                onClick={() => handleDownloadWord(item.id || item.expediente_id, dExtra, dExtra.plantilla_seleccionada || dExtra.plantilla)}
                                disabled={descargandoId === (item.id || item.expediente_id)}
                                style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary, border: `1px solid ${theme.border}`, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                {descargandoId === (item.id || item.expediente_id) ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="docx" size={18} />} Descargar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
  );
}


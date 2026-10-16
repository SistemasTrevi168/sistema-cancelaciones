import { useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Eye, FolderPlus, Layers, ListChecks, Loader2, PencilLine, Save, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';
import OpcionesPlantilla from './OpcionesPlantilla';
import ZonaArchivos from './ZonaArchivos';
import EspacioExpediente from './EspacioExpediente';
import { nombrePlantilla } from '../plantillasCatalogo';
import Selector from './Selector';

export default function TabMasivo() {
  const {
    setSelectedPlantilla,
    abrirVistaPrevia,
    archivosDeLote,
    sugerenciaDeLote,
    usarSugeridasEnLote,
    descargandoId,
    descargandoZip,
    etiquetaCampo,
    faltantesPara,
    selectedPlantilla,
    batchFiles,
    batchLoading,
    batchPreviewIndex,
    batchResults,
    handleApplyTemplateToSelected,
    cartasLote,
    constanciasLote,
    agregarArchivosLote,
    quitarArchivoDeLote,
    soltarArchivosLote,
    handleBatchInputChange,
    handleBatchPlantillaChange,
    handleDownloadWord,
    handleDownloadZip,
    handleSelectAllBatch,
    handleToggleSelectBatch,
    handleUploadBatch,
    progressBatch,
    selectedBatchIndices,
    theme,
    isDarkMode,
    guardarLote,
    guardando,
    moverArchivoLote,
    quitarArchivoLote,
    quitarExpedienteLote,
    numeroEnNombre,
  } = useApp();

  // Archivos cuyo número (en el nombre) no tiene pareja idéntica en el otro recuadro
  const sinPareja = (() => {
    const nums = (lista) => new Set(lista.map((f) => numeroEnNombre(f.name)).filter(Boolean));
    const nCartas = nums(cartasLote);
    const nConst = nums(constanciasLote);
    if (nCartas.size === 0 || nConst.size === 0) return [];
    return [
      ...cartasLote.filter((f) => { const n = numeroEnNombre(f.name); return n && !nConst.has(n); }),
      ...constanciasLote.filter((f) => { const n = numeroEnNombre(f.name); return n && !nCartas.has(n); }),
    ].map((f) => f.name);
  })();

  const [abierto, setAbierto] = useState(null); // expediente en revisión (índice)
  const [cargaAbierta, setCargaAbierta] = useState(false);

  const validos = batchResults.map((r, i) => (r.error ? null : i)).filter((i) => i !== null);
  const enRevision = abierto !== null && batchResults[abierto] && !batchResults[abierto].error ? abierto : null;
  const cargaVisible = batchResults.length === 0 || batchLoading || cargaAbierta;
  const plantillaDe = (res) => res.plantilla_seleccionada || selectedPlantilla;
  const faltanDe = (res) => faltantesPara(res.datos_extraidos || {}, plantillaDe(res));
  const conFaltantes = validos.filter((i) => faltanDe(batchResults[i]).length > 0).length;
  const borradores = validos.filter((i) => !batchResults[i].expediente_id);
  const guardadosN = validos.length - borradores.length;
  const nombreDe = (r) => (r.datos_extraidos?.nombre_acreditado && r.datos_extraidos.nombre_acreditado !== 'NO_ENCONTRADO'
    ? r.datos_extraidos.nombre_acreditado : `Crédito ${r.clave || 'sin número'}`);

  const procesar = () => { setCargaAbierta(false); setAbierto(null); handleUploadBatch(); };

  // ---- ESPACIO DE TRABAJO DE UN EXPEDIENTE ----
  if (enRevision !== null) {
    const idx = enRevision;
    const res = batchResults[idx];
    const pos = validos.indexOf(idx);
    const ir = (p) => setAbierto(validos[p]);
    const navegacion = (
      <div className="nav-lote" style={{ borderColor: theme.border }}>
        <button type="button" className="boton-barra" onClick={() => setAbierto(null)} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }} title="Volver a la lista del lote">
          <ArrowLeft size={15} /> Lista
        </button>
        <button type="button" className="boton-icono" disabled={pos <= 0} onClick={() => ir(pos - 1)} title="Anterior" style={{ borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.cardBg }}><ChevronLeft size={16} /></button>
        <span style={{ color: theme.textSecondary }}>{pos + 1} de {validos.length}</span>
        <button type="button" className="boton-icono" disabled={pos >= validos.length - 1} onClick={() => ir(pos + 1)} title="Siguiente" style={{ borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.cardBg }}><ChevronRight size={16} /></button>
      </div>
    );
    return (
      <EspacioExpediente
        key={idx}
        destino={{ origen: 'batch', index: idx }}
        prefijo={`batch_${idx}`}
        datos={res.datos_extraidos || {}}
        archivos={archivosDeLote(res)}
        actos={res.actos || []}
        plantilla={plantillaDe(res)}
        onPlantilla={(v) => handleBatchPlantillaChange(idx, v)}
        sugerencia={sugerenciaDeLote(res)}
        onUsarSugerida={(v) => handleBatchPlantillaChange(idx, v)}
        onCambio={(campo, valor) => handleBatchInputChange(idx, campo, valor)}
        expedienteId={res.expediente_id}
        navegacion={navegacion}
        previaActiva={batchPreviewIndex === idx}
        onPrevia={() => abrirVistaPrevia({ origen: 'batch', index: idx, flotante: true, lado: 'izquierda' })}
        onGuardar={() => guardarLote([idx])}
        avisos={res.avisos}
        guardandoAhora={!!guardando[res.ref]}
      />
    );
  }

  return (
    <div className="carga-documentos">
      {/* ---- CARGA DEL LOTE ---- */}
      {cargaVisible ? (
        <>
          <div className="carga-encabezado">
            <h2 style={{ color: theme.textPrimary }}><FolderPlus size={20} color={theme.accent} /> Carga masiva de expedientes</h2>
            <p style={{ color: theme.textSecondary }}>Sube las <strong>cartas</strong> y las <strong>constancias</strong> de varios créditos, cada tipo en su recuadro (archivos sueltos o carpetas). Se leen sus datos para que los revises, muevas archivos entre expedientes y corrijas; <strong>nada se guarda</strong> hasta que le des “Guardar”.</p>
          </div>
          <div className="zonas-tipo">
            <ZonaArchivos
              tipo="carta"
              varios
              archivos={cartasLote}
              onElegir={(fs) => agregarArchivosLote('carta', fs)}
              onSoltar={(e) => soltarArchivosLote('carta', e)}
              onQuitar={(f) => quitarArchivoDeLote('carta', f)}
              ayuda="Arrastra aquí las cartas (PDF sueltos o una carpeta)"
            />
            <ZonaArchivos
              tipo="constancia"
              varios
              archivos={constanciasLote}
              onElegir={(fs) => agregarArchivosLote('constancia', fs)}
              onSoltar={(e) => soltarArchivosLote('constancia', e)}
              onQuitar={(f) => quitarArchivoDeLote('constancia', f)}
              ayuda="Arrastra aquí las constancias (PDF sueltos o una carpeta)"
            />
          </div>

          <div className="carga-acciones" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <label htmlFor="plantilla-lote" className="carga-subtitulo" style={{ color: theme.textSecondary }}>Plantilla inicial del lote</label>
              <Selector id="plantilla-lote" value={selectedPlantilla} onChange={(e) => setSelectedPlantilla(e.target.value)} className="selector-plantilla selector-grande" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}>
                <OpcionesPlantilla />
              </Selector>
              <p style={{ fontSize: '12px', color: theme.textSecondary, margin: '6px 0 0 0' }}>
                Cada carta se junta con su constancia por el número de crédito (o por el nombre del acreditado). Después puedes mover archivos entre expedientes.
              </p>
            </div>

            <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {batchLoading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: theme.textSecondary }}>
                    <span>Leyendo documentos…</span><span>{progressBatch}%</span>
                  </div>
                  <div className="barra-progreso" style={{ backgroundColor: theme.subtleBg }}>
                    <div style={{ width: `${progressBatch}%`, backgroundColor: theme.accent }} />
                  </div>
                </div>
              )}
              {!batchLoading && sinPareja.length > 0 && (
                <p className="aviso-sin-pareja" style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>
                  Sin pareja con el mismo número ({sinPareja.length}): {sinPareja.slice(0, 4).join(', ')}{sinPareja.length > 4 ? '…' : ''}. Se leerán como expedientes incompletos.
                </p>
              )}
              {!batchLoading && batchFiles.length > 0 && sinPareja.length === 0 && cartasLote.length !== constanciasLote.length && (
                <p style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>
                  Hay {cartasLote.length} carta(s) y {constanciasLote.length} constancia(s): algunos expedientes quedarán incompletos.
                </p>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                {batchResults.length > 0 && !batchLoading && (
                  <button type="button" className="boton-barra" onClick={() => setCargaAbierta(false)} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={procesar}
                  disabled={batchFiles.length === 0 || batchLoading}
                  className="boton-principal"
                  style={{ backgroundColor: batchFiles.length === 0 || batchLoading ? theme.subtleBg : theme.accent, color: batchFiles.length === 0 || batchLoading ? theme.textSecondary : '#fff', cursor: batchFiles.length === 0 || batchLoading ? 'not-allowed' : 'pointer' }}
                >
                  {batchLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <FolderPlus size={16} />}
                  Leer documentos ({batchFiles.length})
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="lote-resumen" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg, color: theme.textSecondary }}>
          <FolderPlus size={18} color={theme.accent} />
          <span><strong style={{ color: theme.textPrimary }}>{batchFiles.length} archivos</strong> · {validos.length} expediente(s) leídos</span>
          <button type="button" className="boton-barra" onClick={() => setCargaAbierta(true)} style={{ marginLeft: 'auto', backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
            <Upload size={15} /> Cargar otro lote
          </button>
        </div>
      )}

      {/* ---- RESULTADOS ---- */}
      {batchResults.length > 0 && (
        <section className="resultados-lote" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
          <header className="resultados-encabezado" style={{ borderColor: theme.border }}>
            <div className="resultados-titulo">
              <input
                type="checkbox"
                checked={validos.length > 0 && selectedBatchIndices.length === batchResults.length}
                onChange={handleSelectAllBatch}
                style={{ width: '17px', height: '17px', cursor: 'pointer', accentColor: theme.accent }}
                title="Marcar todos"
              />
              <h2 style={{ color: theme.textPrimary }}><ListChecks size={19} color={theme.accent} /> Resultados ({validos.length})</h2>
              {borradores.length > 0 && <span className="chip-dato chip-borrador"><PencilLine size={12} /> {borradores.length} sin guardar</span>}
              {guardadosN > 0 && <span className="chip-dato chip-ok"><Save size={12} /> {guardadosN} guardados</span>}
              {conFaltantes > 0 && <span className="chip-dato chip-falta"><AlertTriangle size={12} /> {conFaltantes} con faltantes</span>}
            </div>
            <div className="resultados-acciones">
              <Selector
                value=""
                disabled={selectedBatchIndices.length === 0}
                onChange={(e) => handleApplyTemplateToSelected(e.target.value)}
                className="selector-plantilla"
                title={selectedBatchIndices.length === 0 ? 'Marca uno o más expedientes con la casilla para cambiar su plantilla' : ''}
                style={{ borderColor: selectedBatchIndices.length ? theme.accent : theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
              >
                <option value="" disabled>
                  {selectedBatchIndices.length === 0 ? 'Marca expedientes para cambiar su plantilla' : `Plantilla para ${selectedBatchIndices.length} marcado(s)…`}
                </option>
                <OpcionesPlantilla />
              </Selector>
              {validos.some((i) => sugerenciaDeLote(batchResults[i])?.plantilla) && (
                <button type="button" onClick={usarSugeridasEnLote} className="chip-sugerida" style={{ padding: '7px 12px', fontSize: '12px' }} title="Pone a cada expediente la plantilla que le corresponde según sus documentos">
                  <Sparkles size={13} /> Usar las plantillas sugeridas
                </button>
              )}
              {borradores.length > 0 && (
                <button type="button" onClick={() => guardarLote(borradores)} disabled={borradores.some((i) => guardando[batchResults[i].ref])} className="boton-barra boton-guardar" title="Guarda en la base todos los expedientes revisados y genera sus Word">
                  {borradores.some((i) => guardando[batchResults[i].ref]) ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />} Guardar y procesar todos ({borradores.length})
                </button>
              )}
              <button type="button" onClick={handleDownloadZip} disabled={descargandoZip} className="boton-barra boton-word">
                {descargandoZip ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="zip" size={18} />} Descargar todo (ZIP)
              </button>
            </div>
          </header>

          <div className="filas-lote">
            {batchResults.map((res, idx) => {
              if (res.error) {
                return (
                  <div key={res.ref || idx} className="fila-lote fila-error" style={{ borderColor: '#fecaca', backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', color: isDarkMode ? '#fca5a5' : '#991b1b' }}>
                    <AlertTriangle size={16} />
                    <span style={{ flex: 1 }}><strong>No se pudieron leer {(res.archivos || []).join(', ') || res.clave}:</strong> {res.error}</span>
                    <button type="button" className="boton-icono" title="Quitar de la lista" onClick={() => quitarExpedienteLote(res.ref)} style={{ borderColor: 'currentColor', color: 'inherit', background: 'transparent' }}><X size={15} /></button>
                  </div>
                );
              }
              const d = res.datos_extraidos || {};
              const faltan = faltanDe(res);
              const sug = sugerenciaDeLote(res);
              const enUsoSug = sug?.plantilla && sug.plantilla === res.plantilla_seleccionada;
              const marcado = selectedBatchIndices.includes(idx);
              const guardado = !!res.expediente_id;
              const otros = batchResults.filter((r) => r.ref !== res.ref && !r.error && !r.expediente_id);
              return (
                <div
                  key={res.ref || idx}
                  className={`fila-lote entrada-escalonada ${marcado ? 'marcada' : ''}`}
                  style={{ animationDelay: `${Math.min(idx, 12) * 30}ms`, borderColor: batchPreviewIndex === idx ? theme.accent : theme.border, backgroundColor: theme.cardBg }}
                >
                  <input type="checkbox" checked={marcado} onChange={() => handleToggleSelectBatch(idx)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }} aria-label="Marcar expediente" />

                  <button type="button" className="fila-nombre" onClick={() => setAbierto(idx)} title="Revisar con el PDF">
                    {faltan.length > 0 ? <AlertTriangle size={17} color="#d97706" /> : <CheckCircle size={17} color="#10b981" />}
                    <span>
                      <strong style={{ color: theme.textPrimary }}>{d.nombre_acreditado && d.nombre_acreditado !== 'NO_ENCONTRADO' ? d.nombre_acreditado : 'Acreditado no identificado'}</strong>
                      <small style={{ color: theme.textSecondary }}>
                        {guardado ? '✓ Guardado' : 'Borrador'}
                        {' · '}{d.numero_credito ? `Crédito ${d.numero_credito}` : 'Sin número de crédito'}
                        {res.actos?.length > 1 ? ` · ${res.actos.length} actos` : ''}
                        {faltan.length > 0 ? ` · faltan: ${faltan.map(etiquetaCampo).join(', ')}` : ''}
                      </small>
                    </span>
                    {res.leyendo && <Loader2 size={15} color={theme.accent} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                  </button>

                  {res.avisos?.length > 0 && (
                    <div className="fila-avisos">
                      {res.avisos.map((a) => <span key={a}><AlertTriangle size={12} /> {a}</span>)}
                    </div>
                  )}

                  {/* Archivos del expediente: se pueden mover a otro o quitar mientras sea borrador */}
                  <div className="fila-archivos">
                    {(res.archivos || []).map((n) => (
                      <span key={n} className="chip-archivo" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg, color: theme.textPrimary }} title={n}>
                        <IconoArchivo tipo="pdf" size={14} />
                        {res.tipos?.[n] && <span className={`marca-tipo ${res.tipos[n]}`}>{res.tipos[n] === 'carta' ? 'Carta' : 'Constancia'}</span>}
                        <span className="chip-archivo-nombre">{n}</span>
                        {!guardado && !res.leyendo && (
                          <>
                            <Selector
                              value=""
                              aria-label={`Mover ${n} a otro expediente`}
                              title="Mover a otro expediente"
                              onChange={(e) => moverArchivoLote(n, res.ref, e.target.value)}
                              className="selector-mover"
                              style={{ color: theme.textSecondary }}
                            >
                              <option value="" disabled>Mover…</option>
                              {otros.map((o) => <option key={o.ref} value={o.ref}>{nombreDe(o)}</option>)}
                              {(res.archivos || []).length > 1 && <option value="nuevo">Expediente nuevo</option>}
                            </Selector>
                            <button type="button" className="quitar-archivo" title={`Quitar ${n}`} onClick={() => quitarArchivoLote(n, res.ref)}><X size={12} /></button>
                          </>
                        )}
                      </span>
                    ))}
                  </div>

                  <div className="fila-plantilla">
                    <Selector
                      value={res.plantilla_seleccionada || ''}
                      onChange={(e) => handleBatchPlantillaChange(idx, e.target.value)}
                      className="selector-plantilla"
                      title={`Plantilla: ${nombrePlantilla(res.plantilla_seleccionada)}`}
                      style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
                    >
                      <option value="" disabled>Seleccionar plantilla...</option>
                      <OpcionesPlantilla />
                    </Selector>
                    {sug?.plantilla && (enUsoSug ? (
                      <span className="chip-sugerida chip-sugerida-ok" title={`Plantilla sugerida en uso\n\n${sug.razones.join('\n')}`}><CheckCircle size={12} /> Sugerida</span>
                    ) : (
                      <button type="button" className="chip-sugerida" title={`Sugerida: ${nombrePlantilla(sug.plantilla)}\n\n${sug.razones.join('\n')}`} onClick={() => handleBatchPlantillaChange(idx, sug.plantilla)}>
                        <Sparkles size={12} /> Usar sugerida
                      </button>
                    ))}
                  </div>

                  <div className="fila-acciones">
                    <button type="button" className="boton-barra boton-revisar" onClick={() => setAbierto(idx)} title="Revisar los datos junto al PDF">
                      <Layers size={14} /> Revisar
                    </button>
                    <button type="button" className="boton-barra" onClick={() => abrirVistaPrevia({ origen: 'batch', index: idx })} style={{ backgroundColor: batchPreviewIndex === idx ? theme.accent : theme.cardBg, color: batchPreviewIndex === idx ? '#fff' : theme.textPrimary, borderColor: batchPreviewIndex === idx ? theme.accent : theme.border }}>
                      <Eye size={14} color={batchPreviewIndex === idx ? '#fff' : theme.accent} /> Previa
                    </button>
                    {guardado ? (
                      <button type="button" className="boton-barra boton-word" onClick={() => handleDownloadWord(res.expediente_id, d, plantillaDe(res))} disabled={descargandoId === res.expediente_id}>
                        {descargandoId === res.expediente_id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="docx" size={16} />} DOCX
                      </button>
                    ) : (
                      <>
                        <button type="button" className="boton-barra boton-guardar" onClick={() => guardarLote([idx])} disabled={!!guardando[res.ref] || res.leyendo} title="Guardar en la base y generar el Word">
                          {guardando[res.ref] ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Guardar
                        </button>
                        <button type="button" className="boton-icono" title="Descartar este expediente" onClick={() => quitarExpedienteLote(res.ref)} style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

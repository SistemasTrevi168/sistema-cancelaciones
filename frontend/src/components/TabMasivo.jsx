import { useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Eye, FileArchive, FolderPlus, Layers, ListChecks, Loader2, Sparkles, Upload,
} from 'lucide-react';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';
import OpcionesPlantilla from './OpcionesPlantilla';
import EspacioExpediente from './EspacioExpediente';
import { nombrePlantilla } from '../plantillasCatalogo';

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
    handleBatchFileChange,
    handleBatchInputChange,
    handleBatchPlantillaChange,
    handleDownloadWord,
    handleDownloadZip,
    handleDragOver,
    handleDropBatch,
    handleSelectAllBatch,
    handleToggleSelectBatch,
    handleUploadBatch,
    progressBatch,
    selectedBatchIndices,
    theme,
    isDarkMode,
  } = useApp();

  const [abierto, setAbierto] = useState(null); // expediente en revisión (índice)
  const [cargaAbierta, setCargaAbierta] = useState(false);

  const validos = batchResults.map((r, i) => (r.error ? null : i)).filter((i) => i !== null);
  const enRevision = abierto !== null && batchResults[abierto] && !batchResults[abierto].error ? abierto : null;
  const cargaVisible = batchResults.length === 0 || batchLoading || cargaAbierta;
  const plantillaDe = (res) => res.plantilla_seleccionada || selectedPlantilla;
  const faltanDe = (res) => faltantesPara(res.datos_extraidos || {}, plantillaDe(res));
  const conFaltantes = validos.filter((i) => faltanDe(batchResults[i]).length > 0).length;

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
            <p style={{ color: theme.textSecondary }}>Sube una carpeta con las cartas y constancias de varios créditos. Se agrupan por número de crédito en el nombre del archivo.</p>
          </div>
          <div className="carga-rejilla">
            <div onDragOver={handleDragOver} onDrop={handleDropBatch} className="zona-soltar" style={{ borderColor: theme.dropzoneBorder, backgroundColor: theme.dropzoneBg }}>
              <FileArchive size={40} color={theme.accent} />
              <p className="zona-titulo" style={{ color: theme.textPrimary }}>Arrastra aquí tu carpeta o varios PDF</p>
              <p className="zona-ayuda" style={{ color: theme.textSecondary }}>se revisan también las subcarpetas</p>
              <input type="file" multiple accept=".pdf" webkitdirectory="true" onChange={handleBatchFileChange} style={{ display: 'none' }} id="batch-file-input" />
              <label htmlFor="batch-file-input" className="boton-barra" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border, cursor: 'pointer' }}>
                Buscar carpeta / archivos
              </label>
            </div>

            <div className="carga-panel" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
              <div>
                <div className="carga-subtitulo" style={{ color: theme.textSecondary }}>Archivos detectados ({batchFiles.length})</div>
                {batchFiles.length === 0 ? (
                  <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '6px 0 0 0' }}>Todavía no has elegido archivos.</p>
                ) : (
                  <ul className="lista-archivos">
                    {batchFiles.map((f, i) => (
                      <li key={i} style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary }}>
                        <IconoArchivo tipo="pdf" size={18} />
                        <span>{f.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label htmlFor="plantilla-lote" className="carga-subtitulo" style={{ color: theme.textSecondary }}>Plantilla inicial del lote</label>
                <select id="plantilla-lote" value={selectedPlantilla} onChange={(e) => setSelectedPlantilla(e.target.value)} className="selector-plantilla selector-grande" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}>
                  <OpcionesPlantilla />
                </select>
                <p style={{ fontSize: '12px', color: theme.textSecondary, margin: '6px 0 0 0' }}>
                  Después puedes usar la plantilla sugerida de cada expediente o cambiarla a mano.
                </p>
              </div>

              {batchLoading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: theme.textSecondary }}>
                    <span>Procesando lote…</span><span>{progressBatch}%</span>
                  </div>
                  <div className="barra-progreso" style={{ backgroundColor: theme.subtleBg }}>
                    <div style={{ width: `${progressBatch}%`, backgroundColor: theme.accent }} />
                  </div>
                </div>
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
                  Procesar carga masiva
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="lote-resumen" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg, color: theme.textSecondary }}>
          <FolderPlus size={18} color={theme.accent} />
          <span><strong style={{ color: theme.textPrimary }}>{batchFiles.length} archivos</strong> · {validos.length} expediente(s) procesados</span>
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
              <span className="chip-dato chip-ok"><CheckCircle size={12} /> {validos.length - conFaltantes} completos</span>
              {conFaltantes > 0 && <span className="chip-dato chip-falta"><AlertTriangle size={12} /> {conFaltantes} con faltantes</span>}
            </div>
            <div className="resultados-acciones">
              <select
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
              </select>
              {validos.some((i) => sugerenciaDeLote(batchResults[i])?.plantilla) && (
                <button type="button" onClick={usarSugeridasEnLote} className="chip-sugerida" style={{ padding: '7px 12px', fontSize: '12px' }} title="Pone a cada expediente la plantilla que le corresponde según sus documentos">
                  <Sparkles size={13} /> Usar las plantillas sugeridas
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
                  <div key={idx} className="fila-lote fila-error" style={{ borderColor: '#fecaca', backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', color: isDarkMode ? '#fca5a5' : '#991b1b' }}>
                    <AlertTriangle size={16} /> <strong>No se pudo procesar {res.expediente_id}:</strong> <span>{res.error}</span>
                  </div>
                );
              }
              const d = res.datos_extraidos || {};
              const faltan = faltanDe(res);
              const sug = sugerenciaDeLote(res);
              const enUsoSug = sug?.plantilla && sug.plantilla === res.plantilla_seleccionada;
              const marcado = selectedBatchIndices.includes(idx);
              return (
                <div
                  key={idx}
                  className={`fila-lote entrada-escalonada ${marcado ? 'marcada' : ''}`}
                  style={{ animationDelay: `${Math.min(idx, 12) * 30}ms`, borderColor: batchPreviewIndex === idx ? theme.accent : theme.border, backgroundColor: theme.cardBg }}
                >
                  <input type="checkbox" checked={marcado} onChange={() => handleToggleSelectBatch(idx)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }} aria-label="Marcar expediente" />

                  <button type="button" className="fila-nombre" onClick={() => setAbierto(idx)} title="Revisar con el PDF">
                    {faltan.length > 0 ? <AlertTriangle size={17} color="#d97706" /> : <CheckCircle size={17} color="#10b981" />}
                    <span>
                      <strong style={{ color: theme.textPrimary }}>{d.nombre_acreditado && d.nombre_acreditado !== 'NO_ENCONTRADO' ? d.nombre_acreditado : 'Acreditado no identificado'}</strong>
                      <small style={{ color: theme.textSecondary }}>
                        {d.numero_credito ? `Crédito ${d.numero_credito}` : 'Sin número de crédito'}
                        {res.actos?.length > 1 ? ` · ${res.actos.length} actos` : ''}
                        {faltan.length > 0 ? ` · faltan: ${faltan.map(etiquetaCampo).join(', ')}` : ''}
                      </small>
                    </span>
                  </button>

                  <div className="fila-plantilla">
                    <select
                      value={res.plantilla_seleccionada || ''}
                      onChange={(e) => handleBatchPlantillaChange(idx, e.target.value)}
                      className="selector-plantilla"
                      title={`Plantilla: ${nombrePlantilla(res.plantilla_seleccionada)}`}
                      style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
                    >
                      <option value="" disabled>Seleccionar plantilla...</option>
                      <OpcionesPlantilla />
                    </select>
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
                    <button type="button" className="boton-barra boton-word" onClick={() => handleDownloadWord(res.expediente_id, d, plantillaDe(res))} disabled={descargandoId === res.expediente_id}>
                      {descargandoId === res.expediente_id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="docx" size={16} />} DOCX
                    </button>
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

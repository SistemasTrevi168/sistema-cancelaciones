import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Download, Eye, FileArchive, FileText, FolderPlus, Loader2,
} from 'lucide-react';
import { useApp } from '../AppContext';
import CamposDatos from './CamposDatos';

export default function TabMasivo() {
  const {
    descargandoId,
    descargandoZip,
    etiquetaCampo,
    faltantesPara,
    selectedPlantilla,
    actualizarVistaPreviaMasivaTiempoReal,
    batchFiles,
    batchLoading,
    batchPreviewIndex,
    batchPreviewRef,
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
    openAccordion,
    progressBatch,
    selectedBatchIndices,
    setBatchPreviewIndex,
    theme,
    toggleAccordion,
  } = useApp();

  return (
<div>
    {/* ESTILOS GLOBALES Y TOASTS FLOTANTES (ESQUINA INFERIOR DERECHA) */}
    <style>{`
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(15px); }
        12% { opacity: 1; transform: translateY(0); }
        82% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
      }
      .docx-container-scroll {
        height: 100% !important;
        max-height: 100% !important;
        overflow-y: auto !important;
      }
      .docx-container-scroll .docx-wrapper {
        background-color: transparent !important;
        padding: 12px 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 16px !important;
      }
      .docx-container-scroll .docx-wrapper > section {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        border-radius: 6px !important;
        margin-bottom: 0 !important;
        background-color: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        width: 100% !important;
        max-width: 100% !important;
        padding: 16px !important;
        box-sizing: border-box !important;
      }
    `}</style>

    {/* SECCIÓN SUPERIOR: FORMULARIO DE CARGA */}
    <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}`, marginBottom: '24px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FolderPlus size={20} color={theme.accent} /> Carga Masiva de Expedientes
      </h2>

      <div 
        onDragOver={handleDragOver}
        onDrop={handleDropBatch}
        style={{ border: `2px dashed ${theme.dropzoneBorder}`, backgroundColor: theme.dropzoneBg, borderRadius: '12px', padding: '32px 20px', textAlign: 'center', marginBottom: '20px', cursor: 'pointer' }}
      >
        <FileArchive size={40} color={theme.accent} style={{ margin: '0 auto 12px auto' }} />
        <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: theme.textPrimary }}>
          Arrastra aquí tu carpeta o múltiples archivos PDF
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: theme.textSecondary }}>se escanearán subcarpetas automáticamente</p>
        <input
          type="file"
          multiple
          accept=".pdf"
          webkitdirectory="true"
          onChange={handleBatchFileChange}
          style={{ display: 'none' }}
          id="batch-file-input"
        />
        <label htmlFor="batch-file-input" style={{ backgroundColor: theme.subtleBg, border: `1px solid ${theme.border}`, padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: theme.textPrimary, cursor: 'pointer' }}>
          Buscar Carpeta / Archivos
        </label>
      </div>

      {batchFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: theme.textSecondary }}>
            Archivos Detectados ({batchFiles.length}):
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
            {batchFiles.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', backgroundColor: theme.subtleBg, marginBottom: '6px', fontSize: '13px', color: theme.textPrimary }}>
                <FileText size={14} color={theme.textSecondary} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {batchLoading && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: theme.textSecondary }}>
            <span>Procesando lote de documentos...</span>
            <span>{progressBatch}%</span>
          </div>
          <div style={{ width: '100%', backgroundColor: theme.subtleBg, height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progressBatch}%`, backgroundColor: theme.accent, height: '100%', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      <button
        onClick={() => {
          handleUploadBatch();
        }}
        disabled={batchFiles.length === 0 || batchLoading}
        style={{
          width: '100%',
          backgroundColor: batchFiles.length === 0 || batchLoading ? theme.subtleBg : theme.accent,
          color: batchFiles.length === 0 || batchLoading ? theme.textSecondary : '#fff',
          border: 'none',
          padding: '12px',
          borderRadius: '10px',
          fontWeight: '600',
          fontSize: '14px',
          cursor: batchFiles.length === 0 || batchLoading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        {batchLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <FolderPlus size={16} />}
        Procesar Carga Masiva
      </button>
    </div>

    {/* RESULTADOS DEL LOTE - DISEÑO GRID SEGURO CON MINMAX */}
    {batchResults.length > 0 && (
      <div className="grid-masivo" style={{ 
        display: 'grid', 
        gridTemplateColumns: batchPreviewIndex !== null ? 'minmax(0, 1fr) 440px' : '1fr', 
        gap: '24px',
        alignItems: 'start',
        width: '100%',
        boxSizing: 'border-box',
        transition: 'all 0.3s ease'
      }}>
        
        {/* COLUMNA IZQUIERDA: LISTA Y ACORDEONES */}
        <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}`, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <input 
                type="checkbox"
                checked={batchResults.length > 0 && selectedBatchIndices.length === batchResults.length}
                onChange={handleSelectAllBatch}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: theme.accent }}
                title="Seleccionar todos"
              />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary }}>
                Resultados del Lote ({batchResults.length})
              </h2>

              {/* SELECTOR GLOBAL (CORREGIDO Y SIN LA VARIABLE 'res') */}
              {selectedBatchIndices.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const plantillaElegida = e.target.value;
                    if (plantillaElegida) {
                      handleApplyTemplateToSelected(plantillaElegida);
                      e.target.value = ""; 
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.inputBg,
                    color: theme.textPrimary,
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="" disabled>Aplicar a seleccionados ({selectedBatchIndices.length})...</option>
                  
                  <optgroup label="CDMX - APERTURA DE CRÉDITO">
                    <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
                    <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
                    <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
                    <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
                  </optgroup>

                  <optgroup label="CONTRATO DE MUTUO (CDMX)">
                    <option value="CDMX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
                    <option value="CDMX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
                    <option value="CDMX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
                    <option value="CDMX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
                  </optgroup>

                  <optgroup label="MODELOS COACREDITADOS">
                    <option value="COAC_CDMX_AP">CDMX - Ap. Crédito</option>
                    <option value="COAC_CDMX_MUTUO">CDMX - C. Mutuo</option>
                    <option value="COAC_EDOMEX_AP">EDOMEX - Ap. Crédito</option>
                    <option value="COAC_EDOMEX_MUTUO">EDOMEX - C. Mutuo</option>
                  </optgroup>

                  <optgroup label="EDOMEX - APERTURA DE CRÉDITO">
                    <option value="EDOMEX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
                    <option value="EDOMEX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
                    <option value="EDOMEX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
                    <option value="EDOMEX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
                  </optgroup>

                  <optgroup label="CONTRATO DE MUTUO (EDOMEX)">
                    <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
                    <option value="EDOMEX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
                    <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
                    <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
                  </optgroup>
                </select>
              )}
            </div>

            <button
              onClick={handleDownloadZip}
              disabled={descargandoZip}
              style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {descargandoZip ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={16} />} Descargar Todo (ZIP)
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {batchResults.map((res, idx) => {
              if (res.error) {
                return (
                  <div key={idx} style={{ border: '1px solid #ef4444', borderRadius: '10px', padding: '14px 18px', backgroundColor: '#fef2f2', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#b91c1c', fontSize: '14px', fontWeight: '600' }}>
                      <span>⚠️ Error al procesar archivo:</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{res.expediente_id}</span>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: '12px', color: '#7f1d1d' }}>
                      Detalle: {res.error}
                    </p>
                  </div>
                );
              }
              const isOpen = !!openAccordion[idx];
              const datosExtraidos = res.datos_extraidos || {};
              const acreditadoNombre = datosExtraidos.acreditado || datosExtraidos.nombre_acreditado || 'Acreditado no identificado';
              const isPreviewingThis = batchPreviewIndex === idx;
              const isSelected = selectedBatchIndices.includes(idx);
              const faltanItem = faltantesPara(datosExtraidos, res.plantilla_seleccionada || datosExtraidos.plantilla_seleccionada || selectedPlantilla);

              return (
                <div key={idx} style={{ border: `1px solid ${isPreviewingThis ? theme.accent : theme.border}`, borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.2s ease' }}>
                  <div 
                    onClick={() => toggleAccordion(idx)}
                    style={{ padding: '14px 18px', backgroundColor: theme.subtleBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap', gap: '8px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleSelectBatch(idx);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }}
                      />
                      {faltanItem.length > 0
                        ? <AlertTriangle size={18} color="#d97706" />
                        : <CheckCircle size={18} color="#10b981" />}
                      <span style={{ fontWeight: '600', fontSize: '14px', color: theme.textPrimary }}>
                        {acreditadoNombre}
                      </span>
                      {faltanItem.length > 0 && (
                        <span title={`Faltan: ${faltanItem.map(etiquetaCampo).join(', ')}`} style={{ fontSize: '11px', fontWeight: '600', color: '#92400e', backgroundColor: '#fef3c7', padding: '2px 8px', borderRadius: '999px', border: '1px solid #fcd34d' }}>
                          ⚠ Faltan {faltanItem.length} dato(s)
                        </span>
                      )}
                      {datosExtraidos.numero_credito && (
                        <span style={{ fontSize: '12px', color: theme.textSecondary, backgroundColor: theme.cardBg, padding: '2px 8px', borderRadius: '4px', border: `1px solid ${theme.border}` }}>
                          Crédito: {datosExtraidos.numero_credito}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* SELECTOR INDIVIDUAL CARGA MASIVA*/}
              {selectedBatchIndices.length > 0 && (
                <select
  value={res.plantilla_seleccionada || ""}
  onChange={(e) => {
    const nuevaPlantilla = e.target.value;
    handleBatchPlantillaChange(idx, nuevaPlantilla);
    if (batchPreviewIndex === idx) {
      setTimeout(() => {
        actualizarVistaPreviaMasivaTiempoReal(idx);
      }, 50);
    }
  }}
  onClick={(e) => e.stopPropagation()}
  style={{
    padding: '6px 8px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.inputBg,
    color: theme.textPrimary,
    fontSize: '12px',
    outline: 'none',
    cursor: 'pointer',
    maxWidth: '200px'
  }}
  title="Seleccionar plantilla para este expediente"
>
  <option value="" disabled>Seleccionar plantilla...</option>
  
  <optgroup label="CDMX - APERTURA DE CRÉDITO">
    <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
    <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
    <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
    <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
  </optgroup>

  <optgroup label="CONTRATO DE MUTUO (CDMX)">
    <option value="CDMX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
    <option value="CDMX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
    <option value="CDMX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
    <option value="CDMX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
  </optgroup>

  <optgroup label="MODELOS COACREDITADOS">
    <option value="COAC_CDMX_AP">CDMX - Ap. Crédito</option>
    <option value="COAC_CDMX_MUTUO">CDMX - C. Mutuo</option>
    <option value="COAC_EDOMEX_AP">EDOMEX - Ap. Crédito</option>
    <option value="COAC_EDOMEX_MUTUO">EDOMEX - C. Mutuo</option>
  </optgroup>

  <optgroup label="EDOMEX - APERTURA DE CRÉDITO">
    <option value="EDOMEX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
    <option value="EDOMEX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
    <option value="EDOMEX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
    <option value="EDOMEX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
  </optgroup>

  <optgroup label="CONTRATO DE MUTUO (EDOMEX)">
    <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
    <option value="EDOMEX_MUTUO_H_CASADO"> C. Mutuo - Hombre Casado</option>
    <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
    <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
  </optgroup>
</select>
              )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBatchPreviewIndex(idx);
                          actualizarVistaPreviaMasivaTiempoReal(idx);
                        }}
                        style={{ 
                          backgroundColor: isPreviewingThis ? theme.accent : theme.cardBg, 
                          color: isPreviewingThis ? '#fff' : theme.textPrimary, 
                          border: `1px solid ${theme.border}`, 
                          padding: '6px 10px', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          fontWeight: '600', 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px' 
                        }}
                      >
                        <Eye size={12} color={isPreviewingThis ? '#fff' : theme.accent} /> 
                        {isPreviewingThis ? 'Viendo' : 'Previa'}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadWord(res.expediente_id, datosExtraidos);
                        }}
                        disabled={descargandoId === res.expediente_id}
                        style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {descargandoId === res.expediente_id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />} DOCX
                      </button>
                      {isOpen ? <ChevronUp size={18} color={theme.textSecondary} /> : <ChevronDown size={18} color={theme.textSecondary} />}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '18px', backgroundColor: theme.cardBg, borderTop: `1px solid ${theme.border}` }}>
                      <CamposDatos
                        datos={datosExtraidos}
                        prefijo={`batch_${idx}`}
                        faltantes={faltanItem}
                        onCambio={(campo, valor) => handleBatchInputChange(idx, campo, valor)}
                        compacto
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA DERECHA: PANEL DE VISTA PREVIA MASIVA (ANCHO FIJO ESTABLE 440px) */}
        {batchPreviewIndex !== null && (
          <div style={{ 
            backgroundColor: theme.cardBg, 
            borderRadius: '16px', 
            border: `1px solid ${theme.border}`,
            height: '650px',
            maxHeight: '650px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'sticky',
            top: '24px',
            width: '440px',
            flexShrink: 0,
            boxSizing: 'border-box'
          }}>
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: `1px solid ${theme.border}`, 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              backgroundColor: theme.subtleBg
            }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Eye size={18} color={theme.accent} /> 
                Previa ({batchResults[batchPreviewIndex]?.datos_extraidos?.acreditado || 'Expediente'})
              </h2>

              <button
                onClick={() => {
                  if (batchPreviewRef.current) {
                    batchPreviewRef.current.innerHTML = "";
                  }
                  setBatchPreviewIndex(null);
                }}
                style={{ 
                  backgroundColor: '#ef4444', 
                  color: '#ffffff', 
                  border: 'none', 
                  padding: '5px 12px', 
                  borderRadius: '20px', 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0
                }}
              >
                <span>Cerrar</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', marginLeft: '2px' }}>✕</span>
              </button>
            </div>

            <div style={{ flex: 1, padding: '12px', overflow: 'hidden', backgroundColor: theme.dropzoneBg }}>
              <div 
                ref={batchPreviewRef} 
                className="docx-container-scroll"
              />
            </div>
          </div>
        )}

      </div>
    )}
  </div>
  );
}


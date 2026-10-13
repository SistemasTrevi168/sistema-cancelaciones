import {
  CheckCircle, Download, Eye, FileText, Loader2, Lock, Unlock, Upload,
} from 'lucide-react';
import { useApp } from '../AppContext';

export default function TabIndividual() {
  const {
    cargandoPreview,
    datos,
    expedienteId,
    formatLabel,
    handleDownloadWord,
    handleDragOver,
    handleDropSingle,
    handleGenerarVistaPrevia,
    handleInputChange,
    handleSingleFileChange,
    handleToggleUnlock,
    handleUploadSingle,
    loading,
    mostrarVistaPrevia,
    previewContainerRef,
    progressSingle,
    selectedPlantilla,
    setMostrarVistaPrevia,
    setSelectedPlantilla,
    singleFiles,
    theme,
    unlockedFields
  } = useApp();

  return (
<div style={{ 
    display: 'grid', 
    gridTemplateColumns: datos ? (mostrarVistaPrevia ? '1fr 1fr 1.2fr' : '1fr 1fr') : '1fr', 
    gap: '24px',
    transition: 'all 0.3s ease',
    alignItems: 'start'
  }}>
    {/* COLUMNA 1: FORMULARIO DE CARGA DE ARCHIVOS */}
    <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Upload size={20} color={theme.accent} /> Cargar Expediente Individual
      </h2>

      {/* SELECTOR DE PLANTILLA NOTARIAL 2026 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textPrimary, marginBottom: '8px' }}>
          📜 Selecciona la Plantilla Notarial (Modelo 2026):
        </label>
        <select
          value={selectedPlantilla}
          onChange={(e) => setSelectedPlantilla(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.inputBg,
            color: theme.textPrimary,
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          <optgroup label="CDMX - APERTURA DE CRÉDITO">
            <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
            <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
            <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
            <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
          </optgroup>

          <optgroup label="CONTRATO DE MUTUO">
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

          <optgroup label="CONTRATO DE MUTUO">
            <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
            <option value="EDOMEX_MUTUO_H_CASADO"> C. Mutuo - Hombre Casado</option>
            <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
            <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
          </optgroup>
        </select>
      </div>

      <div 
        onDragOver={handleDragOver}
        onDrop={handleDropSingle}
        style={{ border: `2px dashed ${theme.dropzoneBorder}`, backgroundColor: theme.dropzoneBg, borderRadius: '12px', padding: '32px 20px', textAlign: 'center', marginBottom: '20px', cursor: 'pointer' }}
      >
        <FileText size={40} color={theme.accent} style={{ margin: '0 auto 12px auto' }} />
        <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: theme.textPrimary }}>
          Arrastra aquí tus archivos PDF
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: theme.textSecondary }}>o selecciona manualmente desde tu equipo</p>
        <input
          type="file"
          multiple
          accept=".pdf"
          onChange={handleSingleFileChange}
          style={{ display: 'none' }}
          id="single-file-input"
        />
        <label htmlFor="single-file-input" style={{ backgroundColor: theme.subtleBg, border: `1px solid ${theme.border}`, padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: theme.textPrimary, cursor: 'pointer' }}>
          Buscar Archivos
        </label>
      </div>

      {singleFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: theme.textSecondary }}>
            Archivos Seleccionados ({singleFiles.length}):
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
            {singleFiles.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', backgroundColor: theme.subtleBg, marginBottom: '6px', fontSize: '13px', color: theme.textPrimary }}>
                <FileText size={14} color={theme.textSecondary} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: theme.textSecondary }}>
            <span>Procesando documentos...</span>
            <span>{progressSingle}%</span>
          </div>
          <div style={{ width: '100%', backgroundColor: theme.subtleBg, height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progressSingle}%`, backgroundColor: theme.accent, height: '100%', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      <button
        onClick={handleUploadSingle}
        disabled={singleFiles.length === 0 || loading}
        style={{
          width: '100%',
          backgroundColor: singleFiles.length === 0 || loading ? theme.subtleBg : theme.accent,
          color: singleFiles.length === 0 || loading ? theme.textSecondary : '#fff',
          border: 'none',
          padding: '12px',
          borderRadius: '10px',
          fontWeight: '600',
          fontSize: '14px',
          cursor: singleFiles.length === 0 || loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
        Procesar Expediente
      </button>
    </div>

    {/* COLUMNA 2: DATOS EXTRAÍDOS Y EDITABLES */}
    {datos && (
      <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={20} color="#10b981" /> Datos Extraídos
          </h2>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* BOTÓN DE VISTA PREVIA */}
            <button
              onClick={handleGenerarVistaPrevia}
              disabled={cargandoPreview}
              style={{ 
                backgroundColor: theme.subtleBg, 
                color: theme.textPrimary, 
                border: `1px solid ${theme.border}`, 
                padding: '8px 12px', 
                borderRadius: '8px', 
                fontWeight: '600', 
                fontSize: '13px', 
                cursor: cargandoPreview ? 'wait' : 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px' 
              }}
            >
              {cargandoPreview ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={14} color={theme.accent} />} 
              {mostrarVistaPrevia ? 'Actualizar Previa' : 'Vista Previa'}
            </button>

            {/* BOTÓN DESCARGAR WORD */}
            <button
              onClick={() => handleDownloadWord(expedienteId, datos)}
              style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} /> Descargar Word
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
          {Object.entries(datos).map(([key, val]) => {
            if (key === 'datos_inmueble') return null;
            const isUnlocked = unlockedFields[`single_${key}`];
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary }}>
                  {formatLabel(key)}
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={val || ''}
                    disabled={!isUnlocked}
                    onChange={(e) => handleInputChange(key, e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: val === "NO_ENCONTRADO" ? '1px solid #dc3545' : `1px solid ${theme.border}`,
                      backgroundColor: val === "NO_ENCONTRADO" ? '#fff8f8' : (isUnlocked ? theme.inputBg : theme.subtleBg),
                      color: val === "NO_ENCONTRADO" ? '#dc3545' : theme.textPrimary,
                      fontSize: '13px',
                      fontWeight: val === "NO_ENCONTRADO" ? '600' : 'normal',
                      opacity: isUnlocked ? 1 : 0.8
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleToggleUnlock(`single_${key}`)}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: isUnlocked ? '#fef3c7' : theme.subtleBg,
                      color: isUnlocked ? '#d97706' : theme.textSecondary,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {isUnlocked ? <Unlock size={16} /> : <Lock size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* COLUMNA 3: VISTA PREVIA (CON ENCABEZADO CORREGIDO) */}
    {mostrarVistaPrevia && (
      <div style={{ 
        backgroundColor: theme.cardBg, 
        borderRadius: '16px', 
        border: `1px solid ${theme.border}`,
        height: '650px',
        maxHeight: '650px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}>
        
        {/* Reglas CSS para docx-preview */}
        <style>{`
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
          .docx-container-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .docx-container-scroll::-webkit-scrollbar-thumb {
            background-color: rgba(156, 163, 175, 0.5);
            border-radius: 8px;
          }
        `}</style>

        {/* Encabezado Vista Previa con el botón alineado a la derecha extrema */}
<div style={{ 
  padding: '14px 16px', 
  borderBottom: `1px solid ${theme.border}`, 
  display: 'flex', 
  flexDirection: 'row',
  justifyContent: 'space-between', 
  alignItems: 'center',
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: theme.subtleBg
}}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <Eye size={18} color={theme.accent} />
    <span style={{ fontSize: '15px', fontWeight: '700', color: theme.textPrimary }}>
      Vista Previa
    </span>
  </div>

  <button
    onClick={() => {
      if (previewContainerRef.current) {
        previewContainerRef.current.innerHTML = "";
      }
      setMostrarVistaPrevia(false);
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
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)',
      marginLeft: 'auto'
    }}
    title="Cerrar vista previa"
  >
    <span>Cerrar</span>
    <span style={{ fontSize: '12px', fontWeight: 'bold' }}>✕</span>
  </button>
</div>

        {/* Visor de documento con scroll */}
        <div style={{ flex: 1, padding: '12px', overflow: 'hidden', backgroundColor: theme.dropzoneBg }}>
          {cargandoPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px', color: theme.textSecondary }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Cargando vista previa...</span>
            </div>
          ) : (
            <div 
              ref={previewContainerRef} 
              className="docx-container-scroll"
            />
          )}
        </div>

      </div>
    )}
  </div>
  );
}


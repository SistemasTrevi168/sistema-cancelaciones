import {
  AlertTriangle, CheckCircle, Eye, FileSearch, FileText, Layers, Loader2, Upload,
} from 'lucide-react';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';
import CamposDatos from './CamposDatos';
import OpcionesPlantilla from './OpcionesPlantilla';

export default function TabIndividual() {
  const {
    abrirVistaPrevia,
    vistaPrevia,
    abrirVisorDocs,
    visorDocs,
    actosSingle,
    isDarkMode,
    descargandoId,
    etiquetaCampo,
    faltantesPara,
    datos,
    expedienteId,
    handleDownloadWord,
    handleDragOver,
    handleDropSingle,
    handleInputChange,
    handleSingleFileChange,
    handleUploadSingle,
    loading,
    progressSingle,
    selectedPlantilla,
    setSelectedPlantilla,
    singleFiles,
    theme,
  } = useApp();

  return (
<div className="grid-individual" style={{ 
    display: 'grid', 
    gridTemplateColumns: datos ? '1fr 1fr' : '1fr', 
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
          <OpcionesPlantilla />
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
                <IconoArchivo tipo="pdf" size={18} />
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
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {/* BOTÓN PARA VER LOS PDF (seleccionar texto / elegir acto) */}
            {singleFiles.some((f) => /\.pdf$/i.test(f.name)) && (
              <button
                onClick={() => abrirVisorDocs({ origen: 'single' })}
                title="Ver los PDF subidos y seleccionar de dónde tomar un dato"
                style={{
                  backgroundColor: visorDocs?.origen === 'single' ? '#7c3aed' : theme.subtleBg,
                  color: visorDocs?.origen === 'single' ? '#fff' : theme.textPrimary,
                  border: `1px solid ${theme.border}`,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FileSearch size={14} color={visorDocs?.origen === 'single' ? '#fff' : '#7c3aed'} />
                Ver PDF
              </button>
            )}

            {/* BOTÓN DE VISTA PREVIA */}
            <button
              onClick={() => abrirVistaPrevia({ origen: 'single' })}
              style={{ 
                backgroundColor: vistaPrevia?.origen === 'single' ? theme.accent : theme.subtleBg, 
                color: vistaPrevia?.origen === 'single' ? '#fff' : theme.textPrimary, 
                border: `1px solid ${theme.border}`, 
                padding: '8px 12px', 
                borderRadius: '8px', 
                fontWeight: '600', 
                fontSize: '13px', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px' 
              }}
            >
              <Eye size={14} color={vistaPrevia?.origen === 'single' ? '#fff' : theme.accent} />
              Vista Previa
            </button>

            {/* BOTÓN DESCARGAR WORD */}
            <button
              onClick={() => handleDownloadWord(expedienteId, datos)}
              disabled={descargandoId === expedienteId}
              style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {descargandoId === expedienteId ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="docx" size={18} />} Descargar Word
            </button>
          </div>
        </div>

        {/* CONSTANCIA CON VARIOS ACTOS: de cuál se tomaron los datos */}
        {actosSingle.length > 1 && (() => {
          const elegido = actosSingle.find((a) => a.elegido);
          return (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: isDarkMode ? '#1e1b4b' : '#f5f3ff', color: isDarkMode ? '#c4b5fd' : '#5b21b6', border: `1px solid ${isDarkMode ? '#4c1d95' : '#ddd6fe'}`, padding: '10px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px' }}>
              <Layers size={18} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                La constancia trae <strong>{actosSingle.length} actos</strong>.{' '}
                {elegido
                  ? <>La escritura, el notario y el monto se tomaron de <strong>{elegido.clave || 'el acto'}</strong> (pág. {elegido.pagina}).</>
                  : <>No se identificó con seguridad la hipoteca: revisa la escritura, el notario y el monto.</>}
              </div>
              <button type="button" onClick={() => abrirVisorDocs({ origen: 'single' })} style={{ background: 'transparent', border: `1px solid currentColor`, color: 'inherit', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Revisar actos
              </button>
            </div>
          );
        })()}

        {(() => {
          const faltan = faltantesPara(datos, selectedPlantilla);
          if (faltan.length === 0) return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: isDarkMode ? '#052e16' : '#ecfdf5', color: isDarkMode ? '#86efac' : '#065f46', border: `1px solid ${isDarkMode ? '#166534' : '#a7f3d0'}`, padding: '10px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px' }}>
              <CheckCircle size={16} /> Están completos todos los datos que usa la plantilla seleccionada.
            </div>
          );
          return (
            <div style={{ display: 'flex', gap: '10px', backgroundColor: isDarkMode ? '#422006' : '#fffbeb', color: isDarkMode ? '#fcd34d' : '#92400e', border: `1px solid ${isDarkMode ? '#a16207' : '#fcd34d'}`, padding: '12px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Faltan {faltan.length} dato(s) que usa la plantilla:</strong> {faltan.map(etiquetaCampo).join(', ')}.
                <div style={{ marginTop: '4px' }}>Están marcados en rojo. Haz clic en el candado del campo para capturarlo.</div>
              </div>
            </div>
          );
        })()}

        <div style={{ maxHeight: '560px', overflowY: 'auto', paddingRight: '4px' }}>
          <CamposDatos
            datos={datos}
            prefijo="single"
            faltantes={faltantesPara(datos, selectedPlantilla)}
            onCambio={handleInputChange}
          />
        </div>
      </div>
    )}

  </div>
  );
}


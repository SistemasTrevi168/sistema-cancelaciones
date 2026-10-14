import { CheckCircle, FilePlus, FileText, Loader2, Upload, X } from 'lucide-react';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';
import OpcionesPlantilla from './OpcionesPlantilla';
import EspacioExpediente from './EspacioExpediente';

export default function TabIndividual() {
  const {
    abrirVistaPrevia,
    vistaPrevia,
    archivosSingle,
    actosSingle,
    sugerenciaSingle,
    usarPlantillaSugerida,
    nuevoExpedienteSingle,
    guardarSingle,
    guardando,
    datos,
    expedienteId,
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

  // ---- ESPACIO DE TRABAJO (ya hay datos extraídos) ----
  if (datos) {
    return (
      <EspacioExpediente
        destino={{ origen: 'single' }}
        prefijo="single"
        datos={datos}
        archivos={archivosSingle}
        actos={actosSingle}
        plantilla={selectedPlantilla}
        onPlantilla={setSelectedPlantilla}
        sugerencia={sugerenciaSingle}
        onUsarSugerida={usarPlantillaSugerida}
        onCambio={handleInputChange}
        expedienteId={expedienteId}
        previaActiva={vistaPrevia?.origen === 'single'}
        onPrevia={() => abrirVistaPrevia({ origen: 'single' })}
        onGuardar={guardarSingle}
        guardandoAhora={!!guardando.single}
        accionesExtra={(
          <button type="button" onClick={nuevoExpedienteSingle} className="boton-barra" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }} title="Subir los documentos de otro expediente">
            <FilePlus size={15} color={theme.accent} /> Nuevo expediente
          </button>
        )}
      />
    );
  }

  // ---- CARGA DE DOCUMENTOS ----
  const listo = singleFiles.length > 0 && !loading;
  return (
    <div className="carga-documentos">
      <div className="carga-encabezado">
        <h2 style={{ color: theme.textPrimary }}><Upload size={20} color={theme.accent} /> Cargar expediente individual</h2>
        <p style={{ color: theme.textSecondary }}>Sube la <strong>carta de instrucción</strong> y la <strong>constancia de folio</strong> del mismo crédito. Primero se leen los datos para que los revises y corrijas junto al PDF; <strong>nada se guarda</strong> hasta que le des “Guardar y procesar”.</p>
      </div>

      <div className="carga-rejilla">
        {/* Zona para soltar archivos */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDropSingle}
          className="zona-soltar"
          style={{ borderColor: theme.dropzoneBorder, backgroundColor: theme.dropzoneBg }}
        >
          <FileText size={40} color={theme.accent} />
          <p className="zona-titulo" style={{ color: theme.textPrimary }}>Arrastra aquí tus archivos PDF</p>
          <p className="zona-ayuda" style={{ color: theme.textSecondary }}>o selecciónalos desde tu equipo</p>
          <input key={singleFiles.length ? "con" : "vacio"} type="file" multiple accept=".pdf" onChange={handleSingleFileChange} style={{ display: "none" }} id="single-file-input" />
          <label htmlFor="single-file-input" className="boton-barra" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border, cursor: 'pointer' }}>
            Buscar archivos
          </label>
        </div>

        {/* Archivos elegidos, plantilla y botón */}
        <div className="carga-panel" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
          <div>
            <div className="carga-subtitulo" style={{ color: theme.textSecondary }}>Archivos ({singleFiles.length})</div>
            {singleFiles.length === 0 ? (
              <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '6px 0 0 0' }}>Todavía no has elegido archivos.</p>
            ) : (
              <ul className="lista-archivos">
                {singleFiles.map((f, i) => (
                  <li key={i} style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary }}>
                    <IconoArchivo tipo="pdf" size={18} />
                    <span>{f.name}</span>
                    <small style={{ color: theme.textSecondary }}>{(f.size / 1024).toFixed(0)} KB</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="plantilla-individual" className="carga-subtitulo" style={{ color: theme.textSecondary }}>Plantilla</label>
            <select
              id="plantilla-individual"
              value={selectedPlantilla}
              onChange={(e) => setSelectedPlantilla(e.target.value)}
              className="selector-plantilla selector-grande"
              style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
            >
              <OpcionesPlantilla />
            </select>
            <p style={{ fontSize: '12px', color: theme.textSecondary, margin: '6px 0 0 0' }}>
              Al procesar, el sistema te sugiere la plantilla según los documentos.
            </p>
          </div>

          {loading && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: theme.textSecondary }}>
                <span>Leyendo documentos…</span><span>{progressSingle}%</span>
              </div>
              <div className="barra-progreso" style={{ backgroundColor: theme.subtleBg }}>
                <div style={{ width: `${progressSingle}%`, backgroundColor: theme.accent }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            {singleFiles.length > 0 && !loading && (
              <button type="button" onClick={nuevoExpedienteSingle} className="boton-barra" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }} title="Quitar los archivos">
                <X size={15} /> Quitar
              </button>
            )}
            <button
              type="button"
              onClick={handleUploadSingle}
              disabled={!listo}
              className="boton-principal"
              style={{ backgroundColor: listo ? theme.accent : theme.subtleBg, color: listo ? '#fff' : theme.textSecondary, cursor: listo ? 'pointer' : 'not-allowed' }}
            >
              {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
              Leer documentos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

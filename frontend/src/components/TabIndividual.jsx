import { AlertTriangle, CheckCircle, FilePlus, Loader2, Upload } from 'lucide-react';
import { useApp } from '../AppContext';
import ZonaArchivos from './ZonaArchivos';
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
    avisosSingle,
    guardando,
    datos,
    expedienteId,
    handleInputChange,
    cartaSingle,
    constanciaSingle,
    elegirArchivoSingle,
    quitarArchivoSingle,
    soltarArchivoSingle,
    handleUploadSingle,
    loading,
    progressSingle,
    selectedPlantilla,
    setSelectedPlantilla,
    singleFiles,
    conflictoSingle,
    isDarkMode,
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
        avisos={avisosSingle}
        guardandoAhora={!!guardando.single}
        accionesExtra={(
          <button type="button" onClick={nuevoExpedienteSingle} className="boton-barra" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }} title="Subir los documentos de otro expediente">
            <FilePlus size={15} color={theme.accent} /> Nuevo expediente
          </button>
        )}
      />
    );
  }

  // ---- CARGA DE DOCUMENTOS (carta y constancia por separado) ----
  const listo = singleFiles.length > 0 && !loading && !conflictoSingle;
  return (
    <div className="carga-documentos">
      <div className="carga-encabezado">
        <h2 style={{ color: theme.textPrimary }}><Upload size={20} color={theme.accent} /> Cargar expediente individual</h2>
        <p style={{ color: theme.textSecondary }}>Sube la <strong>carta de instrucción</strong> y la <strong>constancia de folio</strong> del mismo crédito, cada una en su recuadro. Primero se leen los datos para que los revises y corrijas junto al PDF; <strong>nada se guarda</strong> hasta que le des “Guardar y procesar”.</p>
      </div>

      <div className="zonas-tipo">
        <ZonaArchivos
          tipo="carta"
          archivos={cartaSingle ? [cartaSingle] : []}
          conflicto={!!conflictoSingle}
          onElegir={(fs) => elegirArchivoSingle('carta', fs)}
          onSoltar={(e) => soltarArchivoSingle('carta', e)}
          onQuitar={() => quitarArchivoSingle('carta')}
          ayuda="Fecha de expedición, número de carta, fecha de liquidación, crédito y entidad"
        />
        <ZonaArchivos
          tipo="constancia"
          archivos={constanciaSingle ? [constanciaSingle] : []}
          conflicto={!!conflictoSingle}
          onElegir={(fs) => elegirArchivoSingle('constancia', fs)}
          onSoltar={(e) => soltarArchivoSingle('constancia', e)}
          onQuitar={() => quitarArchivoSingle('constancia')}
          ayuda="Acreditado, cónyuge, monto, inmueble, folio, escritura y notario"
        />
      </div>

      <div className="carga-acciones" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
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
            Al leer los documentos, el sistema te sugiere la plantilla.
          </p>
        </div>

        <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
          {conflictoSingle && (
            <div className="aviso-conflicto" role="alert" style={isDarkMode ? { backgroundColor: '#450a0a', color: '#fecaca', borderColor: '#7f1d1d' } : { backgroundColor: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}>
              <AlertTriangle size={16} />
              <span>
                <strong>No son del mismo crédito.</strong> La carta es del <strong>{conflictoSingle.carta}</strong> y la constancia del <strong>{conflictoSingle.constancia}</strong>. Los números deben ser idénticos: cambia el archivo que no corresponde.
              </span>
            </div>
          )}
          {!loading && !conflictoSingle && singleFiles.length === 1 && (
            <p style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>
              Falta {cartaSingle ? 'la constancia' : 'la carta'}. Puedes leer solo un documento, pero los datos que vienen en el otro quedarán vacíos.
            </p>
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
  );
}

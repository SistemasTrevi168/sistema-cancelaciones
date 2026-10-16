import { useRef } from 'react';
import { AlertTriangle, CheckCircle, FilePlus, Loader2, Upload, Users, X } from 'lucide-react';
import { esPlantillaCoac } from '../camposExpediente';
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
    carta2Single,
    coacSingle,
    setCoacManual,
    agregarCarta2Single,
    isDarkMode,
    theme,
  } = useApp();
  const carta2Ref = useRef(null);

  // ---- ESPACIO DE TRABAJO (ya hay datos extraídos) ----
  if (datos) {
    // Plantilla de coacreditados (elegida o sugerida) y todavía no se lee la carta del trabajador dos
    const pideCoac = esPlantillaCoac(selectedPlantilla) || esPlantillaCoac(sugerenciaSingle?.plantilla);
    const avisoCoac = pideCoac && !datos._coacreditados && !carta2Single ? (
      <div className="aviso-datos aviso-coac" style={{ backgroundColor: isDarkMode ? '#083344' : '#ecfeff', color: isDarkMode ? '#67e8f9' : '#155e75', borderColor: isDarkMode ? '#155e75' : '#a5f3fc' }}>
        <Users size={16} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong>Coacreditados:</strong> falta la carta de instrucción del trabajador dos. Agrégala para tomar su nombre, crédito, número de carta y fechas (o captúralos con el candado).
          <div style={{ marginTop: '8px' }}>
            <input ref={carta2Ref} type="file" accept=".pdf" style={{ display: 'none' }} id="archivo-carta2-espacio"
              onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; agregarCarta2Single(fs); }} />
            <button type="button" className="boton-barra" onClick={() => carta2Ref.current?.click()} disabled={loading}
              style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
              {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FilePlus size={14} color="#0891b2" />} Agregar carta del trabajador dos
            </button>
          </div>
        </div>
      </div>
    ) : null;
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
        avisoCoac={avisoCoac}
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
        <p style={{ color: theme.textSecondary }}>{coacSingle
          ? <>Coacreditados: sube la <strong>carta de instrucción de cada trabajador</strong> y la <strong>constancia de folio</strong>, cada una en su recuadro; los tres archivos deben llevar el <strong>mismo número</strong>.</>
          : <>Sube la <strong>carta de instrucción</strong> y la <strong>constancia de folio</strong> del mismo crédito, cada una en su recuadro.</>} Primero se leen los datos para que los revises y corrijas junto al PDF; <strong>nada se guarda</strong> hasta que le des “Guardar y procesar”.</p>
      </div>

      <div className={`zonas-tipo ${coacSingle ? 'zonas-tres' : ''}`}>
        <ZonaArchivos
          tipo="carta"
          titulo={coacSingle ? 'Carta de instrucción · trabajador uno' : ''}
          archivos={cartaSingle ? [cartaSingle] : []}
          conflicto={!!conflictoSingle}
          onElegir={(fs) => elegirArchivoSingle('carta', fs)}
          onSoltar={(e) => soltarArchivoSingle('carta', e)}
          onQuitar={() => quitarArchivoSingle('carta')}
          ayuda="Fecha de expedición, número de carta, fecha de liquidación, crédito y entidad"
        />
        {coacSingle && (
          <ZonaArchivos
            tipo="carta2"
            archivos={carta2Single ? [carta2Single] : []}
            conflicto={!!conflictoSingle}
            onElegir={(fs) => elegirArchivoSingle('carta2', fs)}
            onSoltar={(e) => soltarArchivoSingle('carta2', e)}
            onQuitar={() => quitarArchivoSingle('carta2')}
            ayuda="Nombre, crédito, número de carta y fechas del trabajador dos"
          />
        )}
        <ZonaArchivos
          tipo="constancia"
          archivos={constanciaSingle ? [constanciaSingle] : []}
          conflicto={!!conflictoSingle}
          onElegir={(fs) => elegirArchivoSingle('constancia', fs)}
          onSoltar={(e) => soltarArchivoSingle('constancia', e)}
          onQuitar={() => quitarArchivoSingle('constancia')}
          ayuda={coacSingle ? 'Acreditados, montos, inmueble, folio, escritura y notario' : 'Acreditado, cónyuge, monto, inmueble, folio, escritura y notario'}
        />
      </div>
      <div className="coac-interruptor">
        {coacSingle ? (
          !esPlantillaCoac(selectedPlantilla) && !carta2Single && (
            <button type="button" className="enlace-pequeno" onClick={() => setCoacManual(false)}>
              <X size={13} /> No son coacreditados (quitar el recuadro de la carta dos)
            </button>
          )
        ) : (
          <button type="button" className="enlace-pequeno" onClick={() => setCoacManual(true)}>
            <Users size={13} /> ¿Son coacreditados? Agregar la carta del trabajador dos
          </button>
        )}
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
                {conflictoSingle.mismoArchivo ? (
                  <><strong>Es el mismo archivo en las dos cartas.</strong> Pon la carta del trabajador dos en su recuadro.</>
                ) : conflictoSingle.coac ? (
                  <><strong>No son del mismo expediente.</strong> {conflictoSingle.detalle.map(([t, n]) => <span key={t}>La {t} es del <strong>{n}</strong>. </span>)}Los números deben ser idénticos: cambia el archivo que no corresponde.</>
                ) : (
                  <><strong>No son del mismo crédito.</strong> La carta es del <strong>{conflictoSingle.carta}</strong> y la constancia del <strong>{conflictoSingle.constancia}</strong>. Los números deben ser idénticos: cambia el archivo que no corresponde.</>
                )}
              </span>
            </div>
          )}
          {!loading && !conflictoSingle && singleFiles.length > 0 && (() => {
            const faltanDocs = [
              !cartaSingle && (coacSingle ? 'la carta del trabajador uno' : 'la carta'),
              coacSingle && !carta2Single && 'la carta del trabajador dos',
              !constanciaSingle && 'la constancia',
            ].filter(Boolean);
            if (faltanDocs.length === 0) return null;
            return (
              <p style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>
                Falta {faltanDocs.join(' y ')}. Puedes leer así, pero los datos que vienen ahí quedarán vacíos.
              </p>
            );
          })()}
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

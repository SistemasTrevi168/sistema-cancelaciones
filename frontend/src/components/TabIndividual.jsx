import { useRef } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle, FileCheck2, FilePlus, Hash, Loader2, PencilLine, Trash2, Upload, Users, X } from 'lucide-react';
import useYaGenerados from '../ui/usarYaGenerados';
import { esPlantillaCoac } from '../camposExpediente';
import { useApp } from '../AppContext';
import ZonaArchivos from './ZonaArchivos';
import OpcionesPlantilla from './OpcionesPlantilla';
import EspacioExpediente from './EspacioExpediente';
import Selector from './Selector';

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
    edicionSingle,
    cargandoPdfs,
    editarSinDocumentos,
    salirEdicionSingle,
    volverADocumentos,
  } = useApp();
  // ¿El crédito de estos archivos ya está en Mi Historial? (al editar uno guardado no se avisa: es el mismo)
  const yaGen = useYaGenerados([cartaSingle, carta2Single, constanciaSingle], !edicionSingle);
  const creditosGen = Object.entries(yaGen.creditos);
  const quitarGenerados = () => {
    const ya = new Set(Object.keys(yaGen.porArchivo));
    [['carta', cartaSingle], ['carta2', carta2Single], ['constancia', constanciaSingle]].forEach(([t, f]) => { if (f && ya.has(f.name)) quitarArchivoSingle(t); });
  };
  const ESTADO_TXT = { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' };
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
        avisos={edicionSingle && edicionSingle.estado !== 'GENERADO' && !expedienteId
          ? [...avisosSingle, `Este expediente está «${ESTADO_TXT[edicionSingle.estado] || edicionSingle.estado}». Si guardas cambios, su Word se vuelve a generar y regresa a «Generado».`]
          : avisosSingle}
        avisoCoac={avisoCoac}
        guardandoAhora={!!guardando.single}
        edicion={edicionSingle}
        onSubirDocumentos={edicionSingle ? volverADocumentos : null}
        accionesExtra={edicionSingle ? (
          <button type="button" onClick={salirEdicionSingle} className="boton-barra" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }} title={edicionSingle.origen === 'compartidos' ? 'Regresar a Compartidos conmigo' : 'Regresar a Mi Historial'}>
            <ArrowLeft size={15} color={theme.accent} /> {edicionSingle.origen === 'compartidos' ? 'Compartidos' : 'Mi Historial'}
          </button>
        ) : (
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
      {edicionSingle && (
        <div className="edicion-banda slide-up" style={{ borderColor: theme.accent, backgroundColor: isDarkMode ? '#1e1b4b' : '#eef2ff' }}>
          <div className="edicion-banda-texto">
            <span className="edicion-banda-icono" style={{ backgroundColor: theme.accent }}><PencilLine size={18} color="#fff" /></span>
            <div>
              <strong style={{ color: theme.textPrimary }}>Editando · {edicionSingle.nombre}</strong>
              <div className="edicion-banda-chips">
                {edicionSingle.credito && <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}><Hash size={12} /> Crédito {edicionSingle.credito}</span>}
                <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}>{ESTADO_TXT[edicionSingle.estado] || edicionSingle.estado}</span>
              </div>
              {cargandoPdfs && (
                <p className="edicion-cargando-pdf" style={{ color: theme.accent }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Abriendo los PDF guardados de este expediente…</p>
              )}
              <p style={{ color: theme.textSecondary }}>Sube otra vez la carta y la constancia para revisarlas junto a los datos (seleccionar texto, OCR, actos), o continúa con los datos guardados. Al guardar se <strong>actualiza este mismo expediente</strong>; no se crea otro.</p>
            </div>
          </div>
          <div className="edicion-banda-botones">
            <button type="button" className="boton-barra" onClick={salirEdicionSingle} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
              <ArrowLeft size={15} /> Cancelar
            </button>
            <button type="button" className="boton-barra" onClick={editarSinDocumentos} disabled={loading} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
              <PencilLine size={15} /> Continuar sin documentos
            </button>
          </div>
        </div>
      )}
      <div className="carga-encabezado">
        <h2 style={{ color: theme.textPrimary }}><Upload size={20} color={theme.accent} /> {edicionSingle ? 'Documentos del expediente' : 'Cargar expediente individual'}</h2>
        <p style={{ color: theme.textSecondary }}>{coacSingle
          ? <>Coacreditados: sube la <strong>carta de instrucción de cada trabajador</strong> y la <strong>constancia de folio</strong>, cada una en su recuadro; los tres archivos deben llevar el <strong>mismo número</strong>.</>
          : <>Sube la <strong>carta de instrucción</strong> y la <strong>constancia de folio</strong> del mismo crédito, cada una en su recuadro.</>} Primero se leen los datos para que los revises y corrijas junto al PDF; <strong>nada se guarda</strong> hasta que le des “{edicionSingle ? 'Guardar cambios' : 'Guardar y procesar'}”.</p>
      </div>

      <div className={`zonas-tipo ${coacSingle ? 'zonas-tres' : ''}`}>
        <ZonaArchivos
          tipo="carta"
          titulo={coacSingle ? 'Carta de instrucción · trabajador uno' : ''}
          archivos={cartaSingle ? [cartaSingle] : []}
          yaGenerados={yaGen.porArchivo}
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
            yaGenerados={yaGen.porArchivo}
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
          yaGenerados={yaGen.porArchivo}
          conflicto={!!conflictoSingle}
          onElegir={(fs) => elegirArchivoSingle('constancia', fs)}
          onSoltar={(e) => soltarArchivoSingle('constancia', e)}
          onQuitar={() => quitarArchivoSingle('constancia')}
          ayuda={coacSingle ? 'Acreditados, montos, inmueble, folio, escritura y notario' : 'Acreditado, cónyuge, monto, inmueble, folio, escritura y notario'}
        />
      </div>
      {creditosGen.length > 0 && (
        <div className="aviso-ya-generado slide-up" role="status">
          <FileCheck2 size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{creditosGen.length === 1 ? `El crédito ${creditosGen[0][0]} ya se generó` : 'Estos créditos ya se generaron'}</strong> y está en Mi Historial:
            <ul>
              {creditosGen.map(([c]) => <li key={c}>{creditosGen.length > 1 ? `${c} · ` : ''}{yaGen.porArchivo[Object.keys(yaGen.porArchivo).find((n) => yaGen.porArchivo[n].credito === c)]?.texto || ''}</li>)}
            </ul>
            <span className="aviso-ya-generado-nota">Si lo vuelves a leer y guardar, el sistema te preguntará si actualizar el que ya existe o crear otro. Si solo quieres corregirlo, ábrelo desde Mi Historial con el lápiz.</span>
          </div>
          <button type="button" className="boton-barra boton-descartar" onClick={quitarGenerados}>
            <Trash2 size={14} /> Quitar los archivos
          </button>
        </div>
      )}
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
          <Selector
            id="plantilla-individual"
            value={selectedPlantilla}
            onChange={(e) => setSelectedPlantilla(e.target.value)}
            className="selector-plantilla selector-grande"
            style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
          >
            <OpcionesPlantilla />
          </Selector>
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

import { useState } from 'react';
import { createPortal } from 'react-dom';
import useCelular from '../usarCelular';
import { AlertTriangle, CheckCircle, Copy, Eye, FileText, FileUp, Hash, ListChecks, Loader2, PencilLine, Save, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { revisarIncidencia } from '../datosFaltantes';
import { nombrePlantilla } from '../plantillasCatalogo';
import { useApp } from '../AppContext';
import CamposDatos from './CamposDatos';
import { CampoObservaciones } from './Observaciones';
import useCoincidencias from '../ui/usarCoincidencias';
import { esPlantillaCoac } from '../camposExpediente';
import IconoArchivo from './IconoArchivo';
import OpcionesPlantilla from './OpcionesPlantilla';
import SugerenciaPlantilla from './SugerenciaPlantilla';
import VisorDocumentos from './VisorDocumentos';
import Selector from './Selector';

// Espacio de trabajo de un expediente: arriba la barra (nombre, plantilla sugerida y botones);
// abajo, lado a lado, el PDF (con sus actos) y los datos extraídos.
// Se usa en Caso Individual y al revisar un expediente de la Carga Masiva.
export default function EspacioExpediente({
  destino, prefijo, datos, archivos, actos, plantilla, onPlantilla, sugerencia, onUsarSugerida,
  onCambio, expedienteId, navegacion = null, accionesExtra = null, previaActiva = false, onPrevia,
  onGuardar, guardandoAhora = false, avisos = [], avisoCoac = null, edicion = null, onSubirDocumentos = null,
}) {
  const { theme, isDarkMode, faltantesPara, etiquetaCampo, handleDownloadWord, descargandoId, puedeServidor } = useApp();
  const faltan = faltantesPara(datos, plantilla);
  // Incidencia: sin notario de origen, o sin número ni fecha de escritura -> no puede pasar a firma
  const inc = revisarIncidencia(datos);
  const nombre = datos?.nombre_acreditado && datos.nombre_acreditado !== 'NO_ENCONTRADO' ? datos.nombre_acreditado : 'Acreditado no identificado';
  const credito = datos?.numero_credito && datos.numero_credito !== 'NO_ENCONTRADO' ? datos.numero_credito : '';
  const descargando = descargandoId === expedienteId;
  const guardado = !!expedienteId;
  // En celular se ve una cosa a la vez: los datos o el PDF
  const [vistaMovil, setVistaMovil] = useState('datos');
  // Al dar clic en un semáforo: abre el grupo del dato y lo lleva a la vista
  const [enfocar, setEnfocar] = useState(null);
  const irADato = (clave) => { if (clave) { setVistaMovil('datos'); setEnfocar({ clave, t: Date.now() }); } };
  const plantillaLimpia = String(plantilla || '').replace(/\.docx$/i, '');
  const enUsoSugerida = !!sugerencia?.plantilla && sugerencia.plantilla === plantillaLimpia;
  const esCelular = useCelular();
  // Posibles duplicados (mismo folio real o misma escritura en otro expediente)
  const coincide = useCoincidencias(datos, expedienteId || edicion?.id || '', puedeServidor('coincidencias'));
  const ESTADOS_TXT = { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' };
  const describir = (x) => `${x.acreditado || 'Sin nombre'} (crédito ${x.numero_credito}, de ${x.nombre_usuario}, ${ESTADOS_TXT[x.estado] || x.estado})`;

  const botones = (
    <>
            {accionesExtra}
            <button
              type="button"
              onClick={onPrevia}
              className="boton-barra"
              style={{ backgroundColor: previaActiva ? theme.accent : theme.cardBg, color: previaActiva ? '#fff' : theme.textPrimary, borderColor: previaActiva ? theme.accent : theme.border }}
            >
              <Eye size={15} color={previaActiva ? '#fff' : theme.accent} /> Vista previa
            </button>
            {guardado ? (
              <button
                type="button"
                onClick={() => handleDownloadWord(expedienteId, datos, plantilla)}
                disabled={descargando}
                className="boton-barra boton-word"
              >
                {descargando ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="docx" size={17} />} Descargar Word
              </button>
            ) : (
              <button
                type="button"
                onClick={onGuardar}
                disabled={guardandoAhora}
                className="boton-barra boton-guardar"
                title={edicion ? 'Actualiza este expediente en Mi Historial y vuelve a generar su Word' : 'Guarda el expediente en la base (Mi Historial) y genera su Word'}
              >
                {guardandoAhora ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />} {edicion ? 'Guardar cambios' : 'Guardar y procesar'}
              </button>
            )}
    </>
  );

  return (
    <section className="espacio-expediente" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
      {/* BARRA SUPERIOR */}
      <header className="espacio-barra" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg }}>
        <div className="espacio-fila">
          {navegacion}
          <div className="espacio-titulo">
            <h2 style={{ color: theme.textPrimary }}>{nombre}</h2>
            <div className="espacio-chips">
              {guardado
                ? <span className="chip-dato chip-ok" title="Ya está en Mi Historial"><CheckCircle size={12} /> {edicion ? 'Cambios guardados' : 'Guardado'}</span>
                : edicion
                  ? <span className="chip-dato chip-borrador chip-edicion" title="Al guardar se actualiza este expediente en Mi Historial"><PencilLine size={12} /> {edicion.origen === 'compartidos' ? 'Editando · compartido contigo' : 'Editando · guardado en Mi Historial'}</span>
                  : <span className="chip-dato chip-borrador" title="Todavía no se guarda en la base: revisa y corrige, y después guárdalo"><PencilLine size={12} /> Borrador · sin guardar</span>}
              {credito && <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}><Hash size={12} /> Crédito {credito}</span>}
              <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}><FileText size={12} /> {archivos.length} PDF</span>
              {inc.incidencia && <span className="chip-dato chip-incidencia-grande" title={`${inc.motivo}. No puede pasar a firma.`}><ShieldAlert size={12} /> Incidencia</span>}
            </div>
          </div>
          {!esCelular && <div className="espacio-acciones">{botones}</div>}
        </div>

        <div className="espacio-fila espacio-plantilla">
          <label htmlFor={`${prefijo}_plantilla`} style={{ color: theme.textSecondary }}>Plantilla</label>
          <Selector
            id={`${prefijo}_plantilla`}
            value={plantilla || ''}
            onChange={(e) => onPlantilla(e.target.value)}
            className="selector-plantilla"
            style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
          >
            <option value="" disabled>Seleccionar plantilla...</option>
            <OpcionesPlantilla />
          </Selector>
          <SugerenciaPlantilla sugerencia={sugerencia} actual={plantilla} onUsar={onUsarSugerida} compacto />
        </div>
      </header>

      {/* En celular: pestañas para cambiar entre los datos y el PDF */}
      <div className="espacio-pestanas" role="tablist" style={{ backgroundColor: theme.subtleBg, borderColor: theme.border }}>
        <button type="button" role="tab" aria-selected={vistaMovil === 'datos'} className={vistaMovil === 'datos' ? 'activa' : ''} onClick={() => setVistaMovil('datos')}
          style={vistaMovil === 'datos' ? { backgroundColor: theme.cardBg, color: theme.textPrimary } : { color: theme.textSecondary }}>
          <ListChecks size={15} /> Datos {faltan.length > 0 && <span className="espacio-pestana-falta">{faltan.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={vistaMovil === 'docs'} className={vistaMovil === 'docs' ? 'activa' : ''} onClick={() => setVistaMovil('docs')}
          style={vistaMovil === 'docs' ? { backgroundColor: theme.cardBg, color: theme.textPrimary } : { color: theme.textSecondary }}>
          <FileText size={15} /> Documento{archivos.length > 1 ? 's' : ''} ({archivos.length})
        </button>
      </div>

      {/* CUERPO: PDF | DATOS */}
      <div className={`espacio-cuerpo ver-${vistaMovil}`}>
        <div className="espacio-columna espacio-docs">
          {archivos.length === 0 && edicion && onSubirDocumentos ? (
            <div className="visor-vacio fade-in" style={{ color: theme.textSecondary, backgroundColor: isDarkMode ? '#0b1220' : '#f8fafc' }}>
              <span className="visor-vacio-icono" style={{ backgroundColor: `${theme.accent}1a`, color: theme.accent }}><FileUp size={28} /></span>
              <strong style={{ color: theme.textPrimary }}>Sin documentos en pantalla</strong>
              <p>Estás editando con los datos guardados. Si subes otra vez la carta y la constancia, las ves aquí para seleccionar texto, usar el OCR y elegir el acto.</p>
              <button type="button" className="boton-barra" onClick={onSubirDocumentos} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
                <FileUp size={15} /> Subir documentos
              </button>
            </div>
          ) : (
            <VisorDocumentos key={`${prefijo}-${archivos.map((a) => a.name).join('|')}`} archivos={archivos} actos={actos} destino={destino} />
          )}
        </div>

        <div className="espacio-columna espacio-datos" style={{ borderColor: theme.border }}>
          {/* PANEL DE ESTADO DEL PROYECTO: incidencia, datos faltantes y plantilla */}
          <div className="panel-estado" role="group" aria-label="Estado del proyecto">
            <button type="button" className={`semaforo ${inc.incidencia ? 'rojo' : 'verde'}`} onClick={() => irADato(inc.faltan[0])} aria-disabled={!inc.incidencia}
              title={inc.incidencia ? 'Clic para ir al dato que falta' : 'Trae el notario de origen y el número o la fecha de la escritura'}>
              <span className="semaforo-titulo">{inc.incidencia ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />} {inc.incidencia ? 'Incidencia' : 'Sin incidencia'}</span>
              <span className="semaforo-detalle">{inc.incidencia ? inc.motivo : 'Puede pasar a firma'}</span>
            </button>
            <button type="button" className={`semaforo ${faltan.length ? 'ambar' : 'verde'}`} onClick={() => irADato(faltan[0])} aria-disabled={!faltan.length}
              title={faltan.length ? `Faltan: ${faltan.map(etiquetaCampo).join(', ')}. Clic para ir al primero.` : 'Están completos todos los datos que usa la plantilla'}>
              <span className="semaforo-titulo">{faltan.length ? <AlertTriangle size={15} /> : <CheckCircle size={15} />} {faltan.length ? `Faltan ${faltan.length} dato(s)` : 'Datos completos'}</span>
              <span className="semaforo-detalle">{faltan.length ? faltan.map(etiquetaCampo).join(', ') : 'Todo lo que usa la plantilla'}</span>
            </button>
            <div className={`semaforo ${!plantillaLimpia ? 'ambar' : (sugerencia?.plantilla && !enUsoSugerida ? 'morado' : 'verde')}`}>
              <span className="semaforo-titulo">
                {!plantillaLimpia ? <AlertTriangle size={15} /> : (sugerencia?.plantilla && !enUsoSugerida ? <Sparkles size={15} /> : <CheckCircle size={15} />)}
                {!plantillaLimpia ? 'Sin plantilla' : (sugerencia?.plantilla ? (enUsoSugerida ? 'Plantilla sugerida' : 'Plantilla distinta') : 'Plantilla')}
              </span>
              <span className="semaforo-detalle">
                {!plantillaLimpia ? 'Elige una arriba'
                  : sugerencia?.plantilla && !enUsoSugerida
                    ? <>Sugerida: {nombrePlantilla(sugerencia.plantilla)} {onUsarSugerida && <button type="button" className="semaforo-usar" onClick={() => onUsarSugerida(sugerencia.plantilla)}>Usar</button>}</>
                    : enUsoSugerida ? 'Coincide con la sugerida' : nombrePlantilla(plantillaLimpia)}
              </span>
            </div>
          </div>
          {inc.incidencia && (
            <p className="panel-estado-ayuda incidencia">Para pasar a firma necesita el <b>notario de origen</b> y, además, el <b>número</b> o la <b>fecha</b> de la escritura. Si están en la constancia, captúralos o revisa que el acto elegido sea el de la hipoteca.</p>
          )}
          {faltan.length > 0 && !inc.incidencia && (
            <p className="panel-estado-ayuda">Captúralos con el candado, o selecciónalos en el PDF y elige «Usar como…».</p>
          )}
          {avisos?.length > 0 && (
            <div className="aviso-datos" style={{ backgroundColor: isDarkMode ? '#422006' : '#fff7ed', color: isDarkMode ? '#fdba74' : '#9a3412', borderColor: isDarkMode ? '#9a3412' : '#fed7aa' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <div>{avisos.map((a, i) => (typeof a === 'string' ? <div key={a}>{a}</div> : (
                <div key={a.texto || i} className="aviso-con-accion">
                  <span>{a.texto}</span>
                  {a.etiqueta && (
                    <button type="button" className="boton-barra" onClick={a.accion} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                      {a.icono ? <a.icono size={14} color={theme.accent} /> : null} {a.etiqueta}
                    </button>
                  )}
                </div>
              )))}</div>
            </div>
          )}
          {(coincide.folio.length > 0 || coincide.escritura.length > 0) && (
            <div className="aviso-duplicado" role="status" style={{ backgroundColor: isDarkMode ? '#3b0764' : '#faf5ff', color: isDarkMode ? '#e9d5ff' : '#6b21a8', borderColor: isDarkMode ? '#6b21a8' : '#e9d5ff' }}>
              <Copy size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Posible duplicado</strong>
                {coincide.folio.length > 0 && (
                  <p>El <b>folio real</b> ya está en {coincide.folio.length === 1 ? 'otro expediente' : `${coincide.folio.length} expedientes`}: {coincide.folio.slice(0, 3).map(describir).join('; ')}{coincide.folio.length > 3 ? '…' : ''}.</p>
                )}
                {coincide.escritura.length > 0 && (
                  <p>La <b>misma escritura</b> (número y fecha o notario) ya está en {coincide.escritura.length === 1 ? 'otro expediente' : `${coincide.escritura.length} expedientes`}: {coincide.escritura.slice(0, 3).map(describir).join('; ')}{coincide.escritura.length > 3 ? '…' : ''}.</p>
                )}
                <small>Revisa que no sea el mismo inmueble. Si es correcto (por ejemplo, una escritura con varias viviendas), puedes continuar.</small>
              </div>
            </div>
          )}
          {avisoCoac}
          <CamposDatos datos={datos} prefijo={prefijo} faltantes={faltan} onCambio={onCambio} coac={esPlantillaCoac(plantilla)} plegables enfocar={enfocar} />
          {puedeServidor('observaciones') && <CampoObservaciones id={`${prefijo}_observaciones`} valor={datos?.observaciones} onCambio={(v) => onCambio('observaciones', v)} />}
        </div>
      </div>
      {/* En celular los botones quedan fijos abajo de la pantalla */}
      {esCelular && createPortal(
        <div className="barra-acciones-movil" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>{botones}</div>,
        document.body,
      )}
    </section>
  );
}

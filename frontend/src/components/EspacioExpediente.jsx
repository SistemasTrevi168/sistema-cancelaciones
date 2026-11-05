import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useCelular from '../usarCelular';
import { AlertTriangle, CheckCircle, Copy, Eye, FileText, FileUp, GripHorizontal, GripVertical, Hash, ListChecks, Loader2, PencilLine, RotateCcw, Save, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
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
  // Tamaño del PDF y de los datos: se puede ajustar arrastrando las pestañas (y se recuerda en esta computadora)
  const ancho = useCelular('(min-width: 1101px)');
  const mediana = !ancho && !esCelular;
  const [division, setDivision] = useState(leerDivision);
  const cuerpoRef = useRef(null);
  const docsRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(CLAVE_DIVISION, JSON.stringify(division)); } catch { /* sin almacenamiento */ } }, 300);
    return () => clearTimeout(t);
  }, [division]);
  const cambiado = division.p !== 50 || !!division.alto || !!division.altoDocs;
  const restablecer = () => setDivision({ ...DIVISION_INICIAL });
  const arrastrar = (e, tipo) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const caja = cuerpoRef.current.getBoundingClientRect();
    const y0 = e.clientY;
    const alto0 = tipo === 'alto' ? caja.height : (docsRef.current?.getBoundingClientRect().height || 500);
    document.body.classList.add(tipo === 'columnas' ? 'arrastrando-columnas' : 'arrastrando-filas');
    const mover = (ev) => {
      if (tipo === 'columnas') {
        const p = Math.round(limitar(((ev.clientX - caja.left) / caja.width) * 100, 25, 75));
        setDivision((d) => (d.p === p ? d : { ...d, p }));
      } else if (tipo === 'alto') {
        setDivision((d) => ({ ...d, alto: Math.round(limitar(alto0 + ev.clientY - y0, 420, 2400)) }));
      } else {
        setDivision((d) => ({ ...d, altoDocs: Math.round(limitar(alto0 + ev.clientY - y0, 320, 2000)) }));
      }
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      document.body.classList.remove('arrastrando-columnas', 'arrastrando-filas');
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  };
  const conTeclado = (e, tipo) => {
    const paso = { ArrowLeft: -2, ArrowRight: 2, ArrowUp: -40, ArrowDown: 40 }[e.key];
    if (e.key === 'Home') { e.preventDefault(); restablecer(); return; }
    if (!paso) return;
    e.preventDefault();
    if (tipo === 'columnas' && Math.abs(paso) === 2) setDivision((d) => ({ ...d, p: limitar(d.p + paso, 25, 75) }));
    if (tipo === 'alto' && Math.abs(paso) === 40) setDivision((d) => ({ ...d, alto: Math.round(limitar((d.alto || cuerpoRef.current.getBoundingClientRect().height) + paso, 420, 2400)) }));
    if (tipo === 'docs' && Math.abs(paso) === 40) setDivision((d) => ({ ...d, altoDocs: Math.round(limitar((d.altoDocs || docsRef.current.getBoundingClientRect().height) + paso, 320, 2000)) }));
  };
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
      <div ref={cuerpoRef} className={`espacio-cuerpo ver-${vistaMovil}`}
        style={ancho ? { gridTemplateColumns: `minmax(0, ${division.p}fr) 12px minmax(0, ${100 - division.p}fr)`, ...(division.alto ? { height: `${division.alto}px`, minHeight: '420px' } : {}) } : undefined}>
        <div ref={docsRef} className="espacio-columna espacio-docs" style={mediana && division.altoDocs ? { height: `${division.altoDocs}px` } : undefined}>
          {archivos.length === 0 && edicion && onSubirDocumentos ? (
            <div className="visor-vacio fade-in" style={{ color: theme.textSecondary, backgroundColor: isDarkMode ? '#0b1220' : '#f8fafc' }}>
              <span className="visor-vacio-icono" style={{ backgroundColor: `${theme.accent}1a`, color: theme.accent }}><FileUp size={28} /></span>
              <strong style={{ color: theme.textPrimary }}>Sin documentos en pantalla</strong>
              <p>Estás editando con los datos guardados. Si subes otra vez la carta y la constancia, las ves aquí para subrayar, usar el OCR y elegir el acto.</p>
              <button type="button" className="boton-barra" onClick={onSubirDocumentos} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
                <FileUp size={15} /> Subir documentos
              </button>
            </div>
          ) : (
            <VisorDocumentos key={`${prefijo}-${archivos.map((a) => a.name).join('|')}`} archivos={archivos} actos={actos} destino={destino} />
          )}
        </div>

        {!esCelular && (
          <div
            className={`espacio-divisor ${ancho ? 'vertical' : 'horizontal'}`}
            role="separator"
            tabIndex={0}
            aria-orientation={ancho ? 'vertical' : 'horizontal'}
            aria-label={ancho ? 'Cambiar el ancho del documento y de los datos' : 'Cambiar el alto del documento'}
            {...(ancho ? { 'aria-valuemin': 25, 'aria-valuemax': 75, 'aria-valuenow': division.p } : {})}
            title={`Arrastra para hacer más ${ancho ? 'ancho' : 'alto'} el documento o los datos · doble clic: tamaño original`}
            onPointerDown={(e) => arrastrar(e, ancho ? 'columnas' : 'docs')}
            onKeyDown={(e) => conTeclado(e, ancho ? 'columnas' : 'docs')}
            onDoubleClick={restablecer}
            style={{ '--borde-divisor': theme.border }}
          >
            <span className="espacio-divisor-agarre" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textSecondary }}>
              {ancho ? <GripVertical size={14} /> : <GripHorizontal size={14} />}
            </span>
          </div>
        )}

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
            <p className="panel-estado-ayuda">Captúralos con el candado.</p>
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
      {/* Pestaña de abajo: el alto de todo el espacio (como la esquina de un cuadro de texto) */}
      {ancho && (
        <div className="espacio-ajuste-alto" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg, color: theme.textSecondary }}>
          <div
            className="espacio-ajuste-alto-agarre"
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label="Cambiar el alto del documento y de los datos"
            title="Arrastra hacia abajo o hacia arriba para cambiar el alto · doble clic: tamaño original"
            onPointerDown={(e) => arrastrar(e, 'alto')}
            onKeyDown={(e) => conTeclado(e, 'alto')}
            onDoubleClick={restablecer}
          >
            <GripHorizontal size={16} />
          </div>
          {cambiado && (
            <button type="button" className="espacio-restablecer" onClick={restablecer} title="Volver al tamaño original (mitad y mitad)">
              <RotateCcw size={12} /> Tamaño original
            </button>
          )}
        </div>
      )}
      {mediana && cambiado && (
        <div className="espacio-ajuste-alto" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg, color: theme.textSecondary }}>
          <button type="button" className="espacio-restablecer" onClick={restablecer}><RotateCcw size={12} /> Tamaño original</button>
        </div>
      )}
      {/* En celular los botones quedan fijos abajo de la pantalla */}
      {esCelular && createPortal(
        <div className="barra-acciones-movil" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>{botones}</div>,
        document.body,
      )}
    </section>
  );
}

const CLAVE_DIVISION = 'espacio-division';
const DIVISION_INICIAL = { p: 50, alto: null, altoDocs: null };
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
function leerDivision() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_DIVISION) || 'null');
    if (d && typeof d === 'object') {
      return {
        p: Number.isFinite(d.p) ? limitar(d.p, 25, 75) : 50,
        alto: Number.isFinite(d.alto) ? limitar(d.alto, 420, 2400) : null,
        altoDocs: Number.isFinite(d.altoDocs) ? limitar(d.altoDocs, 320, 2000) : null,
      };
    }
  } catch { /* sin almacenamiento */ }
  return { ...DIVISION_INICIAL };
}

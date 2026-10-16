import { useState } from 'react';
import { createPortal } from 'react-dom';
import useCelular from '../usarCelular';
import { AlertTriangle, CheckCircle, Eye, FileText, Hash, ListChecks, Loader2, PencilLine, Save } from 'lucide-react';
import { useApp } from '../AppContext';
import CamposDatos from './CamposDatos';
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
  onGuardar, guardandoAhora = false, avisos = [], avisoCoac = null,
}) {
  const { theme, isDarkMode, faltantesPara, etiquetaCampo, handleDownloadWord, descargandoId } = useApp();
  const faltan = faltantesPara(datos, plantilla);
  const nombre = datos?.nombre_acreditado && datos.nombre_acreditado !== 'NO_ENCONTRADO' ? datos.nombre_acreditado : 'Acreditado no identificado';
  const credito = datos?.numero_credito && datos.numero_credito !== 'NO_ENCONTRADO' ? datos.numero_credito : '';
  const descargando = descargandoId === expedienteId;
  const guardado = !!expedienteId;
  // En celular se ve una cosa a la vez: los datos o el PDF
  const [vistaMovil, setVistaMovil] = useState('datos');
  const esCelular = useCelular();

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
                title="Guarda el expediente en la base (Mi Historial) y genera su Word"
              >
                {guardandoAhora ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />} Guardar y procesar
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
                ? <span className="chip-dato chip-ok" title="Ya está en Mi Historial"><CheckCircle size={12} /> Guardado</span>
                : <span className="chip-dato chip-borrador" title="Todavía no se guarda en la base: revisa y corrige, y después guárdalo"><PencilLine size={12} /> Borrador · sin guardar</span>}
              {credito && <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}><Hash size={12} /> Crédito {credito}</span>}
              <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}><FileText size={12} /> {archivos.length} PDF</span>
              {faltan.length === 0
                ? <span className="chip-dato chip-ok"><CheckCircle size={12} /> Datos completos</span>
                : <span className="chip-dato chip-falta" title={`Faltan: ${faltan.map(etiquetaCampo).join(', ')}`}><AlertTriangle size={12} /> Faltan {faltan.length} dato(s)</span>}
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
          <VisorDocumentos key={`${prefijo}-${archivos.map((a) => a.name).join('|')}`} archivos={archivos} actos={actos} destino={destino} />
        </div>

        <div className="espacio-columna espacio-datos" style={{ borderColor: theme.border }}>
          {avisos?.length > 0 && (
            <div className="aviso-datos" style={{ backgroundColor: isDarkMode ? '#422006' : '#fff7ed', color: isDarkMode ? '#fdba74' : '#9a3412', borderColor: isDarkMode ? '#9a3412' : '#fed7aa' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <div>{avisos.map((a) => <div key={a}>{a}</div>)}</div>
            </div>
          )}
          {faltan.length > 0 ? (
            <div className="aviso-datos" style={{ backgroundColor: isDarkMode ? '#422006' : '#fffbeb', color: isDarkMode ? '#fcd34d' : '#92400e', borderColor: isDarkMode ? '#a16207' : '#fcd34d' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <div>
                <strong>Faltan {faltan.length} dato(s) que usa la plantilla:</strong> {faltan.map(etiquetaCampo).join(', ')}.
                <div style={{ marginTop: '2px' }}>Captúralos con el candado, o selecciónalos en el PDF y elige “Usar como…”.</div>
              </div>
            </div>
          ) : (
            <div className="aviso-datos" style={{ backgroundColor: isDarkMode ? '#052e16' : '#ecfdf5', color: isDarkMode ? '#86efac' : '#065f46', borderColor: isDarkMode ? '#166534' : '#a7f3d0' }}>
              <CheckCircle size={16} style={{ flexShrink: 0 }} /> Están completos todos los datos que usa la plantilla.
            </div>
          )}
          {avisoCoac}
          <CamposDatos datos={datos} prefijo={prefijo} faltantes={faltan} onCambio={onCambio} coac={esPlantillaCoac(plantilla)} />
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

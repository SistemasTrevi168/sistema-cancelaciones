import { useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle, Eye, Loader2, PencilLine, Save } from 'lucide-react';
import { useApp } from '../AppContext';
import CamposDatos from './CamposDatos';
import OpcionesPlantilla from './OpcionesPlantilla';
import Selector from './Selector';
import { esPlantillaCoac } from '../camposExpediente';
import { nombrePlantilla } from '../plantillasCatalogo';
import { confirmar } from '../ui/notificaciones';

const ESTADO_TXT = { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' };

// Editar un expediente ya guardado (desde Mi Historial): mismos datos que al revisarlo, con vista previa del Word.
// Al guardar se actualiza el expediente, se vuelve a generar su Word y queda en su historial de cambios.
export default function EditarExpediente({ item, onCerrar }) {
  const { theme, isDarkMode, faltantesPara, etiquetaCampo, editarExpediente, abrirVistaPrevia, vistaPrevia, cerrarVistaPrevia } = useApp();
  const id = String(item.id || item.expediente_id);
  const original = item.datos_extraidos || {};
  const [datos, setDatos] = useState(() => ({ ...original }));
  const [plantilla, setPlantilla] = useState(() => original.plantilla_seleccionada || original.plantilla || '');
  const [guardando, setGuardando] = useState(false);
  const estado = item.estado || 'GENERADO';
  const nombre = datos.nombre_acreditado || item.acreditado || 'Expediente';
  const faltan = faltantesPara(datos, plantilla);
  const limpio = (v) => String(v ?? '').trim();
  const cambiados = Object.keys(datos).filter((k) => !k.startsWith('_') && typeof datos[k] !== 'object' && limpio(datos[k]) !== limpio(original[k]));
  const cambioPlantilla = limpio(plantilla) !== limpio(original.plantilla_seleccionada || original.plantilla);
  const hayCambios = cambiados.length > 0 || cambioPlantilla;
  const previaAbierta = vistaPrevia?.origen === 'historial' && String(vistaPrevia.id) === id;

  const verPrevia = (d = datos, p = plantilla) => abrirVistaPrevia({ origen: 'historial', id, datos: d, plantilla: p, titulo: d.nombre_acreditado || nombre });

  const alCambiar = (campo, valor) => {
    const nuevos = { ...datos, [campo]: valor };
    if (campo === 'nombre_conyuge') nuevos.tiene_conyuge = limpio(valor) ? 'Sí' : 'No';
    setDatos(nuevos);
    if (previaAbierta) verPrevia(nuevos, plantilla);
  };
  const alCambiarPlantilla = (p) => {
    setPlantilla(p);
    if (previaAbierta) verPrevia(datos, p);
  };

  const salir = async () => {
    if (hayCambios && !(await confirmar('Los cambios que hiciste no se han guardado y se perderán.', { titulo: '¿Salir sin guardar?', textoConfirmar: 'Salir sin guardar', peligro: true }))) return;
    if (previaAbierta) cerrarVistaPrevia();
    onCerrar(false);
  };

  const guardar = async () => {
    if (!hayCambios) { avisar('No hay cambios por guardar.'); return; }
    const lista = [...cambiados.map(etiquetaCampo), ...(cambioPlantilla ? ['Plantilla'] : [])];
    const aviso = estado !== 'GENERADO'
      ? `\n\nEste expediente está «${ESTADO_TXT[estado] || estado}»: al guardar los cambios regresa a «Generado», porque su Word cambia.`
      : '';
    if (!(await confirmar(`Se van a guardar ${lista.length} cambio(s): ${lista.join(', ')}.${aviso}`, { titulo: 'Guardar cambios', textoConfirmar: 'Guardar cambios' }))) return;
    setGuardando(true);
    const ok = await editarExpediente(id, datos, plantilla);
    setGuardando(false);
    if (ok) {
      if (previaAbierta) cerrarVistaPrevia();
      onCerrar(true);
    }
  };

  const avisar = (texto) => confirmar(texto, { titulo: 'Sin cambios', textoConfirmar: 'Entendido' });

  return (
    <section className="editar-expediente" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }} aria-label={`Editar ${nombre}`}>
      <header className="editar-encabezado" style={{ borderColor: theme.border }}>
        <button type="button" className="boton-barra" onClick={salir} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
          <ArrowLeft size={15} /> Volver al historial
        </button>
        <div className="editar-titulo">
          <h2 style={{ color: theme.textPrimary }}><PencilLine size={19} color={theme.accent} /> Editar · {nombre}</h2>
          <div className="editar-chips">
            <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary }}>Crédito {datos.numero_credito || item.numero_credito || '—'}</span>
            <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary }}>{ESTADO_TXT[estado] || estado}</span>
            {faltan.length === 0
              ? <span className="chip-dato chip-ok"><CheckCircle size={12} /> Datos completos</span>
              : <span className="chip-dato chip-falta" title={`Faltan: ${faltan.map(etiquetaCampo).join(', ')}`}><AlertTriangle size={12} /> Faltan {faltan.length} dato(s)</span>}
            {hayCambios && <span className="chip-dato chip-borrador"><PencilLine size={12} /> {cambiados.length + (cambioPlantilla ? 1 : 0)} cambio(s) sin guardar</span>}
          </div>
        </div>
        <div className="editar-acciones">
          <button type="button" className="boton-barra" onClick={() => verPrevia()} style={{ backgroundColor: previaAbierta ? theme.accent : theme.cardBg, color: previaAbierta ? '#fff' : theme.textPrimary, borderColor: previaAbierta ? theme.accent : theme.border }}>
            <Eye size={15} /> Vista previa
          </button>
          <button type="button" className="boton-barra boton-guardar" onClick={guardar} disabled={guardando || !hayCambios} title={hayCambios ? 'Guardar los cambios y volver a generar el Word' : 'No hay cambios'}>
            {guardando ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />} Guardar cambios
          </button>
        </div>
      </header>

      {estado !== 'GENERADO' && (
        <p className="editar-aviso" style={{ backgroundColor: isDarkMode ? '#422006' : '#fffbeb', borderColor: '#fcd34d', color: isDarkMode ? '#fcd34d' : '#92400e' }}>
          <AlertTriangle size={15} /> Este expediente está «{ESTADO_TXT[estado] || estado}». Si guardas cambios, su Word se vuelve a generar y regresa a «Generado».
        </p>
      )}

      <div className="editar-plantilla">
        <label htmlFor={`editar_${id}_plantilla`} style={{ color: theme.textSecondary }}>Plantilla</label>
        <Selector
          id={`editar_${id}_plantilla`}
          value={plantilla || ''}
          onChange={(e) => alCambiarPlantilla(e.target.value)}
          className="selector-plantilla"
          title={`Plantilla: ${nombrePlantilla(plantilla)}`}
          style={{ borderColor: cambioPlantilla ? theme.accent : theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
        >
          <option value="" disabled>Seleccionar plantilla...</option>
          <OpcionesPlantilla />
        </Selector>
      </div>

      <div className="editar-campos">
        <CamposDatos datos={datos} prefijo={`editar_${id}`} faltantes={faltan} onCambio={alCambiar} coac={esPlantillaCoac(plantilla)} />
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle, CreditCard, Eraser, House, Loader2, PenLine, User } from 'lucide-react';
import { API_BASE, encabezadosSesion } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import { CAMPOS_BASE, esDatoVacio } from '../datosFaltantes';
import { nombrePlantilla } from '../plantillasCatalogo';
import IconoArchivo from './IconoArchivo';
import OpcionesPlantilla from './OpcionesPlantilla';
import PanelVistaPrevia from './PanelVistaPrevia';

// Secciones del formulario (mismo orden y nombres que en los datos extraídos)
const SECCIONES = [
  {
    titulo: 'Acreditado',
    icono: User,
    campos: [
      { clave: 'nombre_acreditado', etiqueta: 'Nombre del acreditado', ejemplo: 'MARIA IDALIA CARRASCO BARDALES', ancho: true, mayusculas: true },
      { clave: 'nombre_conyuge', etiqueta: 'Nombre del cónyuge', ejemplo: 'Solo para plantillas de casados', ancho: true, mayusculas: true },
    ],
  },
  {
    titulo: 'Crédito (carta de instrucción)',
    icono: CreditCard,
    campos: [
      { clave: 'numero_credito', etiqueta: 'Número de crédito', ejemplo: '1505068636', obligatorio: true },
      { clave: 'numero_carta', etiqueta: 'Número de carta', ejemplo: '0543910959' },
      { clave: 'monto_credito', etiqueta: 'Monto del crédito', ejemplo: '167880.96', ayuda: 'Con número; se da formato de pesos y se escribe con letra.', normalizar: true },
      { clave: 'credito_a_salario', etiqueta: 'Crédito en VSM', ejemplo: '45.2095', ayuda: 'Veces salario mínimo, con número.', normalizar: true },
      { clave: 'entidad_financiera', etiqueta: 'Entidad financiera', ejemplo: 'INFONAVIT', mayusculas: true },
      { clave: 'fecha_expedicion', etiqueta: 'Fecha de expedición', ejemplo: '11/08/2026', ayuda: 'Puedes escribirla como 11/08/2026.', normalizar: true },
      { clave: 'fecha_liquidacion', etiqueta: 'Fecha de liquidación', ejemplo: '20/06/2024', normalizar: true },
    ],
  },
  {
    titulo: 'Inmueble (constancia de folio)',
    icono: House,
    campos: [
      { clave: 'folio_real', etiqueta: 'Folio real electrónico', ejemplo: '37509' },
      { clave: 'oficina_registral', etiqueta: 'Oficina registral', ejemplo: 'Toluca' },
      { clave: 'datos_inmueble', etiqueta: 'Datos del inmueble', ejemplo: 'Departamento 2, lote 2, manzana 10, colonia San José la Pilita, Metepec, Estado de México', ancho: true, largo: true },
    ],
  },
  {
    titulo: 'Escritura de origen',
    icono: BookOpen,
    campos: [
      { clave: 'numero_escritura', etiqueta: 'Número de escritura', ejemplo: '6411', ayuda: 'Con número; se escribe con letra.', normalizar: true },
      { clave: 'fecha_escritura', etiqueta: 'Fecha de escritura', ejemplo: '10/09/2018', normalizar: true },
      { clave: 'notario_origen_completo', etiqueta: 'Notario de origen', ejemplo: 'LIC. JORGE VALDES RAMIREZ, NOTARIO PÚBLICO NO. 24 DEL ESTADO DE MÉXICO', ayuda: 'Nombre, número y de dónde es; se le da el formato de la plantilla.', ancho: true, largo: true, normalizar: true },
    ],
  },
];
const TODAS = SECCIONES.flatMap((s) => s.campos.map((c) => c.clave));

export default function TabManual() {
  const {
    abrirVistaPrevia,
    camposDePlantilla,
    normalizarCampo,
    handleDownloadWord,
    descargandoId,
    mensajeFaltantesManual,
    cargando,
    expedientes,
    formData,
    selectedPlantilla,
    setCargando,
    setExpedientes,
    setFormData,
    setSelectedPlantilla,
    theme,
    isDarkMode,
  } = useApp();
  const [generado, setGenerado] = useState(null); // último expediente generado
  const [convirtiendo, setConvirtiendo] = useState({});

  const plantilla = selectedPlantilla || 'CDMX_AP_H_SOLTERO';
  // La vista previa vive dentro de esta pantalla y se actualiza mientras se escribe
  useEffect(() => {
    abrirVistaPrevia({ origen: 'manual', embebido: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usados = new Set([...(camposDePlantilla(plantilla) || CAMPOS_BASE), 'numero_credito']);
  const requeridos = TODAS.filter((c) => usados.has(c));
  const completos = requeridos.filter((c) => !esDatoVacio(formData[c])).length;
  const faltan = requeridos.filter((c) => esDatoVacio(formData[c]));

  const cambiar = (clave, valor) => setFormData((prev) => ({ ...prev, [clave]: valor }));

  // Al salir del campo se le da el formato de la plantilla (números y fechas con letra, etc.)
  const alSalir = async (campo) => {
    const valor = String(formData[campo.clave] || '').trim();
    if (!valor) return;
    if (campo.mayusculas) { cambiar(campo.clave, valor.toUpperCase()); return; }
    if (!campo.normalizar || (!/\d/.test(valor) && campo.clave !== 'notario_origen_completo')) return;
    setConvirtiendo((p) => ({ ...p, [campo.clave]: true }));
    const { valor: nuevo } = await normalizarCampo(campo.clave, valor);
    setConvirtiendo((p) => ({ ...p, [campo.clave]: false }));
    if (nuevo && nuevo !== valor) cambiar(campo.clave, nuevo);
  };

  const limpiar = async () => {
    if (TODAS.some((c) => !esDatoVacio(formData[c])) && !(await confirmar('Se borrarán los datos capturados.', { titulo: '¿Limpiar el formulario?', textoConfirmar: 'Sí, limpiar' }))) return;
    setFormData(Object.fromEntries(TODAS.map((c) => [c, ''])));
    setGenerado(null);
  };

  const generar = async (e) => {
    e.preventDefault();
    if (esDatoVacio(formData.numero_credito)) {
      avisar.aviso('Escribe el número de crédito: es obligatorio.');
      document.getElementById('manual_numero_credito')?.focus();
      return;
    }
    const pendientes = faltan.filter((c) => c !== 'numero_credito');
    if (pendientes.length > 0 && !(await confirmar(mensajeFaltantesManual(pendientes), { titulo: 'Faltan datos', textoConfirmar: 'Generar de todas formas' }))) return;
    setCargando(true);
    try {
      const res = await fetch(`${API_BASE}/api/expedientes/generar-manual`, {
        method: 'POST',
        credentials: 'include',
        headers: encabezadosSesion({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...formData, plantilla }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'exito') {
        avisar.exito('Expediente generado. También lo encuentras en Mi Historial.');
        setGenerado(data);
        if (typeof setExpedientes === 'function' && Array.isArray(expedientes)) setExpedientes([data, ...expedientes]);
      } else {
        avisar.error('Error: ' + (data.detail || 'No se pudo generar'));
      }
    } catch (err) {
      console.error(err);
      avisar.error('Error de conexión con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  const etiquetaEstilo = (falta) => ({ color: falta ? '#dc2626' : theme.textSecondary });

  return (
    <div className="manual-rejilla">
      {/* ---- FORMULARIO ---- */}
      <form onSubmit={generar} className="manual-formulario" noValidate>
        <div className="carga-encabezado">
          <h2 style={{ color: theme.textPrimary }}><PenLine size={20} color={theme.accent} /> Captura manual</h2>
          <p style={{ color: theme.textSecondary }}>Captura los datos de un expediente sin PDF. La vista previa se actualiza mientras escribes.</p>
        </div>

        {/* Plantilla y avance */}
        <div className="manual-plantilla" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label htmlFor="manual_plantilla" className="carga-subtitulo" style={{ color: theme.textSecondary }}>Plantilla</label>
            <select id="manual_plantilla" value={plantilla} onChange={(e) => setSelectedPlantilla(e.target.value)} className="selector-plantilla selector-grande" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}>
              <OpcionesPlantilla />
            </select>
          </div>
          <div className="manual-avance">
            <div style={{ fontSize: '12px', fontWeight: 700, color: theme.textSecondary }}>
              {completos} de {requeridos.length} datos que usa la plantilla
            </div>
            <div className="barra-progreso" style={{ backgroundColor: isDarkMode ? '#0b1220' : '#e2e8f0' }}>
              <div style={{ width: `${requeridos.length ? (completos / requeridos.length) * 100 : 0}%`, backgroundColor: faltan.length ? '#f59e0b' : '#10b981' }} />
            </div>
          </div>
        </div>

        {SECCIONES.map((sec, n) => {
          const Icono = sec.icono;
          return (
            <fieldset key={sec.titulo} className="manual-seccion" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
              <legend style={{ color: theme.textPrimary }}>
                <span className="manual-numero" style={{ backgroundColor: theme.accent }}>{n + 1}</span>
                <Icono size={16} color={theme.accent} /> {sec.titulo}
              </legend>
              <div className="manual-campos">
                {sec.campos.map((c) => {
                  const usa = usados.has(c.clave);
                  const vacio = esDatoVacio(formData[c.clave]);
                  const id = `manual_${c.clave}`;
                  const props = {
                    id,
                    value: formData[c.clave] || '',
                    placeholder: `Ej. ${c.ejemplo}`,
                    onChange: (e) => cambiar(c.clave, e.target.value),
                    onBlur: () => alSalir(c),
                    className: 'manual-entrada',
                    style: { borderColor: usa && vacio ? (isDarkMode ? '#7f1d1d' : '#fecaca') : theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary },
                  };
                  return (
                    <div key={c.clave} className={`manual-campo ${c.ancho ? 'ancho' : ''}`}>
                      <label htmlFor={id} style={etiquetaEstilo(false)}>
                        {c.etiqueta}
                        {(c.obligatorio || usa) && <span className={`marca-uso ${usa && vacio ? 'pendiente' : 'listo'}`} title={c.obligatorio ? 'Obligatorio para generar' : 'La plantilla elegida usa este dato'}>{c.obligatorio ? 'obligatorio' : (vacio ? 'requerido' : '✓')}</span>}
                        {convirtiendo[c.clave] && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', marginLeft: '4px' }} />}
                      </label>
                      {c.largo ? <textarea rows={2} {...props} /> : <input type="text" {...props} />}
                      {c.ayuda && <small style={{ color: theme.textSecondary }}>{c.ayuda}</small>}
                      {c.clave === 'nombre_conyuge' && !usa && <small style={{ color: theme.textSecondary }}>La plantilla elegida no usa el cónyuge.</small>}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {/* Resultado */}
        {generado && (
          <div className="aviso-datos" style={{ backgroundColor: isDarkMode ? '#052e16' : '#ecfdf5', color: isDarkMode ? '#86efac' : '#065f46', borderColor: isDarkMode ? '#166534' : '#a7f3d0', alignItems: 'center' }}>
            <CheckCircle size={18} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <strong>Expediente generado</strong> con la plantilla {nombrePlantilla(generado.plantilla_seleccionada || plantilla)}.
            </div>
            <button type="button" className="boton-barra boton-word" disabled={descargandoId === generado.expediente_id} onClick={() => handleDownloadWord(generado.expediente_id, generado.datos_extraidos, generado.plantilla_seleccionada || plantilla)}>
              {descargandoId === generado.expediente_id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <IconoArchivo tipo="docx" size={16} />} Descargar Word
            </button>
          </div>
        )}

        {/* Botones */}
        <div className="manual-botones" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
          <button type="button" onClick={limpiar} className="boton-barra" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
            <Eraser size={15} /> Limpiar
          </button>
          <button type="submit" disabled={cargando} className="boton-principal" style={{ backgroundColor: theme.accent, color: '#fff' }}>
            {cargando ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
            {cargando ? 'Generando…' : 'Generar expediente'}
          </button>
        </div>
      </form>

      {/* ---- VISTA PREVIA EN VIVO ---- */}
      <div className="manual-previa">
        <PanelVistaPrevia embebido />
      </div>
    </div>
  );
}

// Revisión de datos faltantes antes de generar un Word.
// La lista exacta de campos de cada plantilla viene del backend (/api/plantillas/campos);
// si no está disponible se usa CAMPOS_BASE, que son los que usan todas las plantillas.

export const CAMPOS_BASE = [
  'nombre_acreditado',
  'numero_credito',
  'monto_credito',
  'numero_carta',
  'fecha_liquidacion',
  'folio_real',
  'datos_inmueble',
];

const ETIQUETAS = {
  nombre_acreditado: 'Nombre del acreditado',
  numero_credito: 'Número de crédito',
  monto_credito: 'Monto del crédito',
  numero_carta: 'Número de carta',
  fecha_liquidacion: 'Fecha de liquidación',
  folio_real: 'Folio real',
  datos_inmueble: 'Datos del inmueble',
  fecha_expedicion: 'Fecha de expedición',
  credito_a_salario: 'Crédito a salario',
  numero_escritura: 'Número de escritura',
  fecha_escritura: 'Fecha de escritura',
  notario_origen_completo: 'Notario de origen',
  oficina_registral: 'Oficina registral',
  entidad_financiera: 'Entidad financiera',
  nombre_conyuge: 'Nombre del cónyuge',
  nombre_acreditado_2: 'Nombre del trabajador dos',
  numero_credito_2: 'Número de crédito (trabajador dos)',
  numero_carta_2: 'Número de carta (trabajador dos)',
  fecha_expedicion_2: 'Fecha de expedición (trabajador dos)',
  fecha_liquidacion_2: 'Fecha de liquidación (trabajador dos)',
  credito_a_salario_2: 'Crédito a salario (trabajador dos)',
  monto_credito_2: 'Monto del crédito (trabajador dos)',
};

const VALORES_VACIOS = ['', 'NO_ENCONTRADO', 'N/A', 'NULL', 'NONE', 'UNDEFINED'];

export function etiquetaCampo(clave) {
  return ETIQUETAS[clave] || String(clave).replace(/_/g, ' ');
}

export function esDatoVacio(valor) {
  if (valor === null || valor === undefined) return true;
  return VALORES_VACIOS.includes(String(valor).trim().toUpperCase());
}

export function normalizarPlantilla(plantilla) {
  return String(plantilla || '').replace(/\.docx$/i, '');
}

// Regresa la lista de campos vacíos que la plantilla sí usa
export function camposFaltantes(datos, campos) {
  const lista = Array.isArray(campos) ? campos : CAMPOS_BASE;
  return lista.filter((clave) => esDatoVacio(datos?.[clave]));
}

export function mensajeFaltantes(faltantes, accion = 'generar el Word') {
  return `Faltan ${faltantes.length} dato(s) que usa la plantilla:\n\n• ${faltantes.map(etiquetaCampo).join('\n• ')}\n\n¿Quieres ${accion} de todas formas?`;
}

// INCIDENCIA: el proyecto solo puede pasar a firma si de la escritura de origen trae
// el NOTARIO y, además, el NÚMERO o la FECHA de la escritura. Si no, es una incidencia.
// Se calcula siempre con los datos actuales: si alguien edita el expediente, se actualiza sola.
export function revisarIncidencia(datos) {
  const d = datos || {};
  const sinNotario = esDatoVacio(d.notario_origen_completo);
  const sinNumero = esDatoVacio(d.numero_escritura);
  const sinFecha = esDatoVacio(d.fecha_escritura);
  const faltan = [];
  if (sinNotario) faltan.push('notario_origen_completo');
  if (sinNumero && sinFecha) faltan.push('numero_escritura', 'fecha_escritura');
  const incidencia = faltan.length > 0;
  let motivo = '';
  if (sinNotario && sinNumero && sinFecha) motivo = 'No trae notario de origen, número ni fecha de escritura';
  else if (sinNotario) motivo = 'No trae el notario de origen';
  else if (sinNumero && sinFecha) motivo = 'No trae el número ni la fecha de la escritura';
  return { incidencia, faltan, motivo };
}

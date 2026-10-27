// Cómo se agrupan y nombran los datos de un expediente en pantalla

export const GRUPOS_CAMPOS = [
  { titulo: 'Acreditado', campos: ['nombre_acreditado', 'tiene_conyuge', 'nombre_conyuge'] },
  { titulo: 'Escritura de origen', campos: ['numero_escritura', 'fecha_escritura', 'notario_origen_completo'] },
  { titulo: 'Crédito', campos: ['credito_a_salario', 'monto_credito', 'monto_letras'] },
  { titulo: 'Inmueble', campos: ['oficina_registral', 'folio_real', 'datos_inmueble'] },
  {
    titulo: 'Carta de instrucción',
    campos: ['fecha_expedicion', 'numero_carta', 'fecha_liquidacion', 'numero_credito', 'entidad_financiera'],
  },
];

// Coacreditados: datos del "TRABAJADOR DOS" (los del uno son los de siempre)
export const CAMPOS_TRABAJADOR_DOS = ['nombre_acreditado_2', 'numero_credito_2', 'numero_carta_2', 'fecha_expedicion_2', 'fecha_liquidacion_2', 'credito_a_salario_2', 'monto_credito_2'];
export const esPlantillaCoac = (plantilla) => /^COAC_/i.test(String(plantilla || ''));

export const ETIQUETAS_CAMPOS = {
  nombre_acreditado: 'Nombre del acreditado',
  tiene_conyuge: 'Tiene cónyuge',
  nombre_conyuge: 'Nombre del cónyuge',
  numero_credito: 'Número de crédito',
  monto_credito: 'Monto del crédito',
  monto_letras: 'Monto del crédito en letras',
  credito_a_salario: 'VSMM (veces el salario mínimo mensual)',
  entidad_financiera: 'Entidad financiera',
  numero_carta: 'Número de carta',
  fecha_expedicion: 'Fecha de expedición',
  fecha_liquidacion: 'Fecha de liquidación',
  folio_real: 'Folio real electrónico',
  oficina_registral: 'Oficina registral',
  datos_inmueble: 'Datos del inmueble',
  numero_escritura: 'Número de escritura',
  fecha_escritura: 'Fecha de escritura',
  notario_origen_completo: 'Notario de origen',
  nombre_acreditado_2: 'Nombre del trabajador dos',
  numero_credito_2: 'Número de crédito (dos)',
  numero_carta_2: 'Número de carta (dos)',
  fecha_expedicion_2: 'Fecha de expedición (dos)',
  fecha_liquidacion_2: 'Fecha de liquidación (dos)',
  credito_a_salario_2: 'VSMM (dos)',
  monto_credito_2: 'Monto del crédito (dos)',
};

// Campos internos que no se muestran (o que eran copias de otros campos)
export const CAMPOS_OCULTOS = new Set(['observaciones', 'plantilla_seleccionada', 'plantilla', 'texto_raw', 'error_extraccion', 'acreditado', 'monto', 'monto_letras_2', '_coacreditados', '_trabajador']);

// Campos de texto largo (se muestran en un cuadro más grande)
export const CAMPOS_LARGOS = new Set(['datos_inmueble', 'notario_origen_completo', 'monto_letras']);

// Desglose del inmueble que trae el PDF: "1_vivienda", "2_uso_de_suelo", ...
export const esPuntoInmueble = (clave) => /^\d+_/.test(clave);

export function etiquetaDe(clave) {
  if (ETIQUETAS_CAMPOS[clave]) return ETIQUETAS_CAMPOS[clave];
  const sinNumero = esPuntoInmueble(clave) ? clave.replace(/^\d+_/, '') : clave;
  const texto = sinNumero.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Ordena los datos del expediente en grupos para mostrarlos.
// coac=true (plantilla de coacreditados): se muestra también el grupo del "TRABAJADOR DOS".
export function agruparDatos(datos, coac = false) {
  const claves = Object.keys(datos || {}).filter((k) => !CAMPOS_OCULTOS.has(k) && !k.startsWith('_'));
  const usados = new Set();
  const lista = coac
    ? [
      { titulo: 'Trabajador uno (acreditado)', campos: ['nombre_acreditado'] },
      ...GRUPOS_CAMPOS.slice(1),
      { titulo: 'Trabajador dos (coacreditado)', campos: CAMPOS_TRABAJADOR_DOS, todos: true },
    ]
    : GRUPOS_CAMPOS;
  // Sin coacreditados los datos del trabajador dos no se muestran; con coacreditados no se usa el cónyuge
  const sobran = new Set(coac ? ['tiene_conyuge', 'nombre_conyuge'] : CAMPOS_TRABAJADOR_DOS);
  sobran.forEach((k) => usados.add(k));
  const grupos = lista.map((g) => {
    const campos = g.campos.filter((k) => g.todos || claves.includes(k));
    campos.forEach((k) => usados.add(k));
    return { titulo: g.titulo, campos };
  });
  const puntos = claves
    .filter((k) => !usados.has(k) && esPuntoInmueble(k))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  puntos.forEach((k) => usados.add(k));
  const otros = claves.filter((k) => !usados.has(k));
  // El desglose del inmueble va justo después de «Inmueble»
  if (puntos.length) {
    const desglose = {
      titulo: 'Desglose del inmueble',
      nota: 'Referencia del PDF. El Word usa el campo "Datos del inmueble".',
      campos: puntos,
      plegado: true,
    };
    const i = grupos.findIndex((g) => g.titulo === 'Inmueble');
    grupos.splice(i >= 0 ? i + 1 : grupos.length, 0, desglose);
  }
  if (otros.length) grupos.push({ titulo: 'Otros datos', campos: otros });
  return grupos.filter((g) => g.campos.length > 0);
}

// Datos que se toman del acto (hipoteca) elegido en la constancia del IFREM
export const CAMPOS_DEL_ACTO = ['nombre_acreditado', 'nombre_conyuge', 'numero_escritura', 'fecha_escritura', 'notario_origen_completo', 'monto_credito', 'credito_a_salario'];

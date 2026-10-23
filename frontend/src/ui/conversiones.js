import { conMontoEnLetras, entero } from './montoLetras';

// Datos que llevan su número con letra. Las MISMAS reglas que el servidor (main.limpiar_datos_para_plantilla):
//   Folio real:      "321240" (TRESCIENTOS VEINTIÚN MIL DOSCIENTOS CUARENTA)
//   Número de carta: "0543910959" (cero cinco cuatro tres nueve uno cero nueve cinco nueve)
//   Escritura:       quince mil ochocientos doce
//   Crédito en VSM:  setenta y ocho punto seis mil cuatrocientos cincuenta y siete
// Mientras se escribe, al cambiar el número se rehacen sus letras (lo de los paréntesis);
// al salir del campo, un número escrito solo se pasa a su formato con letra.

const DIGITOS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const digitosConLetra = (d) => d.split('').map((x) => DIGITOS[Number(x)]).join(' ');

const folioLetras = (n) => entero(Number(n));
const escrituraLetras = (n) => entero(Number(n)).toLowerCase();
function salarioLetras(n) {
  const limpio = String(n).replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(limpio)) return null;
  const [ent, dec = ''] = limpio.split('.');
  let txt = entero(Number(ent || 0));
  if (dec) {
    const ceros = dec.length - dec.replace(/^0+/, '').length;
    const resto = dec.replace(/^0+/, '');
    const partes = [...Array(ceros).fill('CERO'), ...(resto ? [entero(Number(resto))] : [])];
    if (partes.length) txt += ` PUNTO ${partes.join(' ')}`;
  }
  return txt.toLowerCase();
}

// Campo -> cómo se escriben sus letras a partir del número
const LETRAS = {
  folio_real: { letras: folioLetras, formato: (n) => `"${String(Number(n))}" (${folioLetras(n)})`, valido: (n) => /^\d+$/.test(n) },
  numero_carta: { letras: digitosConLetra, formato: (n) => `"${n}" (${digitosConLetra(n)})`, valido: (n) => /^\d{3,}$/.test(n) },
  numero_escritura: { letras: escrituraLetras, formato: (n) => escrituraLetras(n.replace(/[,.]/g, '')), valido: (n) => /^\d{1,7}$/.test(n.replace(/[,.]/g, '')), limpiar: (n) => n.replace(/[,.]/g, '') },
  credito_a_salario: { letras: salarioLetras, formato: salarioLetras, valido: (n) => salarioLetras(n) !== null },
};
const reglaDe = (campo) => LETRAS[String(campo).replace(/_2$/, '')];

// "321240" (TRESCIENTOS...  ->  [antes del paréntesis, número]
const CON_PARENTESIS = /^(\s*["“”]?\s*(\d[\d,]*(?:\.\d+)?)\s*["“”]?\s*)\(/;
const SOLO_NUMERO = /^\s*["“”]?\s*(\d[\d,]*(?:\.\d+)?)\s*["“”]?\s*$/;

// Mientras se escribe: si el campo es "número (letras)", las letras siguen al número
export function letrasAlEscribir(campo, valor) {
  const regla = reglaDe(campo);
  const m = regla && String(valor ?? '').match(CON_PARENTESIS);
  if (!m) return valor;
  const n = regla.limpiar ? regla.limpiar(m[2]) : m[2];
  if (!regla.valido(n)) return valor;
  const letras = regla.letras(n);
  return letras ? `${m[1]}(${letras})` : valor;
}

// Al salir del campo: un número solo se pasa a su formato con letra (null = no cambia)
export function formatoAlSalir(campo, valor) {
  const v = String(valor ?? '');
  const base = String(campo).replace(/_2$/, '');
  if (base === 'notario_origen_completo') {
    if (!/^\s*(del\s+licenciad|de\s+la\s+licenciad)/i.test(v)) return null;
    const nuevo = v.replace(/(n[uú]mero)\s+(\d{1,4})(?=[\s,.]|$)/gi, (_, p, n) => `${p} ${escrituraLetras(n)}`);
    return nuevo !== v ? nuevo : null;
  }
  const regla = reglaDe(campo);
  const m = regla && v.match(SOLO_NUMERO);
  if (!m) return null;
  const n = regla.limpiar ? regla.limpiar(m[1]) : m[1];
  if (!regla.valido(n)) return null;
  const nuevo = regla.formato(n);
  return nuevo && nuevo !== v ? nuevo : null;
}

// Fechas: se pasan a letra con el servidor (misma regla que la lectura de los PDF)
export const esFecha = (campo) => /^fecha_(escritura|liquidacion|expedicion)(_2)?$/.test(String(campo));

// ---- Desglose del inmueble -> "Datos del inmueble" ----
export const PUNTOS_INMUEBLE = ['1_vivienda', '2_uso_de_suelo', '3_no_interior', '4_lote', '5_manzana', '6_supermanzana', '7_etapa',
  '8_condominio', '9_calle', '10_no_exterior', '11_denominacion_del_inmueble', '12_seccion', '13_colonia',
  '14_sector', '15_municipio', '16_distrito', '17_estado', '18_observaciones', '19_codigo_postal'];
const etiquetaPunto = (k) => k.split('_').slice(1).join(' ').replace(/\b\w/g, (c) => c.toUpperCase());
const limpio = (t) => String(t ?? '').replace(/\s*:\s*/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
export const textoInmueble = (d) => PUNTOS_INMUEBLE
  .filter((k) => String(d?.[k] ?? '').trim())
  .map((k) => `${etiquetaPunto(k)} ${String(d[k]).trim()}`)
  .join(', ');

// Cambio de un dato con todo lo que depende de él (monto con letra, letras del número, inmueble armado)
export function conConversiones(datos, campo, valor) {
  const nuevo = conMontoEnLetras(datos, campo, letrasAlEscribir(campo, valor));
  // Si "Datos del inmueble" es el armado del desglose (no se escribió a mano), se rehace con el punto que cambió
  if (PUNTOS_INMUEBLE.includes(campo) && datos) {
    const antes = textoInmueble(datos);
    const actual = String(datos.datos_inmueble ?? '');
    if (antes && limpio(actual) === limpio(antes)) nuevo.datos_inmueble = textoInmueble(nuevo);
  }
  return nuevo;
}

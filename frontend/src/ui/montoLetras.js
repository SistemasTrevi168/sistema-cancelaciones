// Monto con letra en pesos: la MISMA regla que el servidor (services.numero_a_letras).
// 198640 -> "CIENTO NOVENTA Y OCHO MIL SEISCIENTOS CUARENTA PESOS CON CERO CENTAVOS, MONEDA NACIONAL"
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DIECES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const VEINTIS = ['VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function grupo(n, apocope = false) {
  if (n <= 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    let t;
    if (r < 10) t = UNIDADES[r];
    else if (r < 20) t = DIECES[r - 10];
    else if (r < 30) t = VEINTIS[r - 20];
    else { const d = Math.floor(r / 10); const u = r % 10; t = DECENAS[d] + (u ? ` Y ${UNIDADES[u]}` : ''); }
    if (apocope) t = t.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/\bUNO$/, 'UN');
    partes.push(t);
  }
  return partes.join(' ');
}

function entero(n, apocope = false) {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1000000);
  const resto = n % 1000000;
  const miles = Math.floor(resto / 1000);
  const cientos = resto % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${entero(millones, true)} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${grupo(miles, true)} MIL`);
  if (cientos) partes.push(grupo(cientos, apocope));
  return partes.join(' ');
}

// Lee montos escritos de muchas formas (igual que el servidor):
// $1,250,300.00 · $1´250,300.00 · $1.800.000.00 · $1 250 300.00 · $170,869 02 · 250000
export function leerMonto(texto) {
  const t = String(texto ?? '').replace(/\$/g, ' ').replace(/M\.?\s?N\.?/gi, ' ').trim();
  if (!t) return null;
  const SEP = "[,.´'’`\\s]";
  const agrupado = new RegExp(`^[0-9]{1,3}(?:${SEP}[0-9]{3})+(?:[.,\\s][0-9]{2})?$`);
  const simple = /^[0-9]+(?:[.,][0-9]{1,2})?$/;
  if (!agrupado.test(t) && !simple.test(t)) return null;
  let crudo = t;
  let centavos = '';
  const mc = crudo.match(/[.,\s]([0-9]{2})$/);
  const pareceMiles = new RegExp(`^[0-9]{1,3}${SEP}[0-9]{2}$`).test(crudo);
  if (mc && (!pareceMiles || /^[0-9]+[.,][0-9]{2}$/.test(crudo))) { centavos = mc[1]; crudo = crudo.slice(0, mc.index); }
  else if (/^[0-9]+[.,][0-9]$/.test(crudo)) { const [e, d] = crudo.split(/[.,]/); crudo = e; centavos = `${d}0`; }
  const enteros = crudo.replace(/[^0-9]/g, '');
  if (!enteros) return null;
  const val = Number(`${Number(enteros)}.${centavos || '00'}`);
  return Number.isFinite(val) ? val : null;
}

// Regresa el texto con letra, o null si el monto no es un número (entonces no se toca el campo)
export function montoALetras(monto) {
  const val = leerMonto(monto);
  if (val === null || val > 999999999999) return null;
  const enteros = Math.floor(val);
  const centavos = Math.round((val - enteros) * 100);
  let txt;
  if (enteros === 0) txt = 'CERO PESOS';
  else {
    const moneda = enteros === 1 ? 'PESO' : (enteros % 1000000 === 0 ? 'DE PESOS' : 'PESOS');
    txt = `${entero(enteros, true)} ${moneda}`;
  }
  const cent = centavos > 0 ? `CON ${grupo(centavos, true)} CENTAVOS` : 'CON CERO CENTAVOS';
  return `${txt} ${cent}, MONEDA NACIONAL`;
}

// Al cambiar el monto, el monto con letra se actualiza solo (también el del trabajador dos)
const PAREJAS = { monto_credito: 'monto_letras', monto_credito_2: 'monto_letras_2' };
export function conMontoEnLetras(datos, campo, valor) {
  const nuevo = { ...datos, [campo]: valor };
  const destino = PAREJAS[campo];
  if (destino) {
    if (String(valor ?? '').trim() === '') nuevo[destino] = '';
    else {
      const letras = montoALetras(valor);
      if (letras) nuevo[destino] = letras;
    }
  }
  return nuevo;
}

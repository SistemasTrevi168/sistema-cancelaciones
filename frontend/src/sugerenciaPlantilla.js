// Plantilla sugerida según los documentos (la calcula el backend al procesar).
// Si el usuario cambia de acto o corrige el cónyuge, la sugerencia se ajusta aquí.

const VACIOS = ['', 'NO_ENCONTRADO', 'NONE', 'NULL', 'N/A'];
const tiene = (v) => !VACIOS.includes(String(v ?? '').trim().toUpperCase());

export function sugerenciaActual(base, datos, actos) {
  if (!base) return null;
  const razones = [...(base.razones || [])];
  const dudas = [...(base.dudas || [])];

  // Tipo de crédito: el del acto que se está usando
  const elegido = (actos || []).find((a) => a.elegido);
  let tipo = base.tipo || 'AP';
  if (elegido?.datos?.tipo_credito && elegido.datos.tipo_credito !== tipo) {
    tipo = elegido.datos.tipo_credito;
    const i = razones.findIndex((r) => /apertura de crédito|contrato de mutuo/i.test(r));
    const texto = `El acto de la hipoteca es ${tipo === 'MUTUO' ? 'un contrato de mutuo' : 'una apertura de crédito'}`;
    if (i >= 0) razones[i] = texto; else razones.push(texto);
  }

  // Estado civil: según el cónyuge que tenga ahora el expediente
  const conyuge = tiene(datos?.nombre_conyuge) ? String(datos.nombre_conyuge).trim() : '';
  const casado = !!conyuge || ['SÍ', 'SI'].includes(String(datos?.tiene_conyuge || '').trim().toUpperCase());
  const sinCivil = razones.filter((r) => !/cónyuge/i.test(r));
  if (conyuge) sinCivil.push(`Aparece su cónyuge: ${conyuge}`);
  else if (casado) sinCivil.push('Los documentos indican que tiene cónyuge');

  const mujer = base.genero === 'FEMENINO';
  const region = base.region || 'EDOMEX';
  let plantilla;
  if (base.coacreditados) plantilla = `COAC_${region}_${tipo}`;
  else {
    const estado = mujer ? (casado ? 'CASADA' : 'SOLTERA') : (casado ? 'CASADO' : 'SOLTERO');
    plantilla = `${region}_${tipo}_${mujer ? 'M' : 'H'}_${estado}`;
  }
  return { ...base, plantilla, tipo, razones: sinCivil, dudas, segura: dudas.length === 0 };
}

// Observaciones del expediente: notas internas (no van en el Word ni cambian su estado)
export const MAX_OBSERVACIONES = 2000;
export const textoObservaciones = (x) => String(x?.observaciones ?? x?.datos_extraidos?.observaciones ?? '').trim();

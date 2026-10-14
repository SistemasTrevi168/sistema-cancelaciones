// Reconocimiento de texto (OCR) para partes del PDF que vengan como imagen.
// La librería se descarga solo la primera vez que se usa.
let trabajador = null;
let alProgresoActual = null;

export async function leerTextoDeImagen(imagen, alProgreso) {
  alProgresoActual = alProgreso;
  if (!trabajador) {
    const { createWorker } = await import('tesseract.js');
    trabajador = createWorker('spa', 1, {
      logger: (m) => alProgresoActual?.(m),
    }).catch((e) => {
      trabajador = null;
      throw e;
    });
  }
  const w = await trabajador;
  const { data } = await w.recognize(imagen);
  return (data?.text || '').trim();
}

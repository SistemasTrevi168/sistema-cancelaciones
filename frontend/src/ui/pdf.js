// Lectura de PDFs en el navegador (pdf.js)
// Se usa la versión «legacy» de pdf.js: trae lo necesario para navegadores viejos
// (por ejemplo Chrome 109, el último que hay para Windows 7 y 8.1). Con la versión normal
// esas computadoras muestran «No se pudo abrir este PDF».
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import urlTrabajador from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = urlTrabajador;

const abiertos = new WeakMap();

// Abre un archivo (File) una sola vez y reutiliza el documento
export function abrirPdf(archivo) {
  if (!abiertos.has(archivo)) {
    const promesa = archivo.arrayBuffer().then((datos) => pdfjsLib.getDocument({ data: datos }).promise);
    abiertos.set(archivo, promesa);
  }
  return abiertos.get(archivo);
}

export { pdfjsLib };

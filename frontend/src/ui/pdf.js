// Lectura de PDFs en el navegador (pdf.js)
import * as pdfjsLib from 'pdfjs-dist';
import urlTrabajador from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

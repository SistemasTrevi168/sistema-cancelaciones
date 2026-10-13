// Formatos de archivo y su color (se usan en IconoArchivo)
export const TIPOS_ARCHIVO = {
  docx: { color: '#2b579a', texto: 'DOCX' },
  doc: { color: '#2b579a', texto: 'DOC' },
  xlsx: { color: '#217346', texto: 'XLSX' },
  xls: { color: '#217346', texto: 'XLS' },
  csv: { color: '#217346', texto: 'CSV' },
  txt: { color: '#64748b', texto: 'TXT' },
  pdf: { color: '#d93025', texto: 'PDF' },
  png: { color: '#7c3aed', texto: 'PNG' },
  zip: { color: '#d97706', texto: 'ZIP' },
};

export function tipoDeArchivo(nombre = '') {
  const ext = String(nombre).split('.').pop().toLowerCase();
  return TIPOS_ARCHIVO[ext] ? ext : 'txt';
}

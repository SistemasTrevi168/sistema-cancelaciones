// Catálogo de plantillas notariales que aparecen en los selectores

export const GRUPOS_PLANTILLAS = [
  {
    grupo: 'CDMX - APERTURA DE CRÉDITO',
    opciones: [
      ['CDMX_AP_H_SOLTERO', 'CDMX · Ap. Crédito - Hombre Soltero'],
      ['CDMX_AP_H_CASADO', 'CDMX · Ap. Crédito - Hombre Casado'],
      ['CDMX_AP_M_SOLTERA', 'CDMX · Ap. Crédito - Mujer Soltera'],
      ['CDMX_AP_M_CASADA', 'CDMX · Ap. Crédito - Mujer Casada'],
    ],
  },
  {
    grupo: 'CDMX - CONTRATO DE MUTUO',
    opciones: [
      ['CDMX_MUTUO_H_SOLTERO', 'CDMX · C. Mutuo - Hombre Soltero'],
      ['CDMX_MUTUO_H_CASADO', 'CDMX · C. Mutuo - Hombre Casado'],
      ['CDMX_MUTUO_M_SOLTERA', 'CDMX · C. Mutuo - Mujer Soltera'],
      ['CDMX_MUTUO_M_CASADA', 'CDMX · C. Mutuo - Mujer Casada'],
    ],
  },
  {
    grupo: 'EDOMEX - APERTURA DE CRÉDITO',
    opciones: [
      ['EDOMEX_AP_H_SOLTERO', 'EDOMEX · Ap. Crédito - Hombre Soltero'],
      ['EDOMEX_AP_H_CASADO', 'EDOMEX · Ap. Crédito - Hombre Casado'],
      ['EDOMEX_AP_M_SOLTERA', 'EDOMEX · Ap. Crédito - Mujer Soltera'],
      ['EDOMEX_AP_M_CASADA', 'EDOMEX · Ap. Crédito - Mujer Casada'],
    ],
  },
  {
    grupo: 'EDOMEX - CONTRATO DE MUTUO',
    opciones: [
      ['EDOMEX_MUTUO_H_SOLTERO', 'EDOMEX · C. Mutuo - Hombre Soltero'],
      ['EDOMEX_MUTUO_H_CASADO', 'EDOMEX · C. Mutuo - Hombre Casado'],
      ['EDOMEX_MUTUO_M_SOLTERA', 'EDOMEX · C. Mutuo - Mujer Soltera'],
      ['EDOMEX_MUTUO_M_CASADA', 'EDOMEX · C. Mutuo - Mujer Casada'],
    ],
  },
  {
    grupo: 'COACREDITADOS',
    opciones: [
      ['COAC_CDMX_AP', 'Coacreditados · CDMX - Ap. Crédito'],
      ['COAC_CDMX_MUTUO', 'Coacreditados · CDMX - C. Mutuo'],
      ['COAC_EDOMEX_AP', 'Coacreditados · EDOMEX - Ap. Crédito'],
      ['COAC_EDOMEX_MUTUO', 'Coacreditados · EDOMEX - C. Mutuo'],
    ],
  },
];

// Nombre legible de una plantilla: "CDMX · Ap. Crédito - Hombre Soltero"
export function nombrePlantilla(valor) {
  const clave = String(valor || '').replace(/\.docx$/i, '');
  for (const g of GRUPOS_PLANTILLAS) {
    const op = g.opciones.find(([v]) => v === clave);
    if (op) return op[1]; // la etiqueta ya dice la entidad (CDMX / EDOMEX)
  }
  return clave || 'Sin plantilla';
}

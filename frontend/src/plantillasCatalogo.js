// Catálogo de plantillas notariales que aparecen en los selectores

export const GRUPOS_PLANTILLAS = [
  {
    grupo: 'CDMX - APERTURA DE CRÉDITO',
    opciones: [
      ['CDMX_AP_H_SOLTERO', 'Ap. Crédito - Hombre Soltero'],
      ['CDMX_AP_H_CASADO', 'Ap. Crédito - Hombre Casado'],
      ['CDMX_AP_M_SOLTERA', 'Ap. Crédito - Mujer Soltera'],
      ['CDMX_AP_M_CASADA', 'Ap. Crédito - Mujer Casada'],
    ],
  },
  {
    grupo: 'CONTRATO DE MUTUO (CDMX)',
    opciones: [
      ['CDMX_MUTUO_H_SOLTERO', 'C. Mutuo - Hombre Soltero'],
      ['CDMX_MUTUO_H_CASADO', 'C. Mutuo - Hombre Casado'],
      ['CDMX_MUTUO_M_SOLTERA', 'C. Mutuo - Mujer Soltera'],
      ['CDMX_MUTUO_M_CASADA', 'C. Mutuo - Mujer Casada'],
    ],
  },
  {
    grupo: 'MODELOS COACREDITADOS',
    opciones: [
      ['COAC_CDMX_AP', 'CDMX - Ap. Crédito'],
      ['COAC_CDMX_MUTUO', 'CDMX - C. Mutuo'],
      ['COAC_EDOMEX_AP', 'EDOMEX - Ap. Crédito'],
      ['COAC_EDOMEX_MUTUO', 'EDOMEX - C. Mutuo'],
    ],
  },
  {
    grupo: 'EDOMEX - APERTURA DE CRÉDITO',
    opciones: [
      ['EDOMEX_AP_H_SOLTERO', 'Ap. Crédito - Hombre Soltero'],
      ['EDOMEX_AP_H_CASADO', 'Ap. Crédito - Hombre Casado'],
      ['EDOMEX_AP_M_SOLTERA', 'Ap. Crédito - Mujer Soltera'],
      ['EDOMEX_AP_M_CASADA', 'Ap. Crédito - Mujer Casada'],
    ],
  },
  {
    grupo: 'CONTRATO DE MUTUO (EDOMEX)',
    opciones: [
      ['EDOMEX_MUTUO_H_SOLTERO', 'C. Mutuo - Hombre Soltero'],
      ['EDOMEX_MUTUO_H_CASADO', 'C. Mutuo - Hombre Casado'],
      ['EDOMEX_MUTUO_M_SOLTERA', 'C. Mutuo - Mujer Soltera'],
      ['EDOMEX_MUTUO_M_CASADA', 'C. Mutuo - Mujer Casada'],
    ],
  },
];

// Nombre legible de una plantilla: "CDMX · Ap. Crédito - Hombre Soltero"
export function nombrePlantilla(valor) {
  const clave = String(valor || '').replace(/\.docx$/i, '');
  for (const g of GRUPOS_PLANTILLAS) {
    const op = g.opciones.find(([v]) => v === clave);
    if (op) {
      if (clave.startsWith('COAC_')) return `Coacreditados · ${op[1]}`;
      return `${clave.startsWith('EDOMEX') ? 'EDOMEX' : 'CDMX'} · ${op[1]}`;
    }
  }
  return clave || 'Sin plantilla';
}

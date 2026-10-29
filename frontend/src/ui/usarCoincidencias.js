import { useEffect, useState } from 'react';
import { api } from '../api';

// Posibles duplicados del expediente que se está revisando: otro expediente con el mismo folio real
// o con la misma escritura (mismo número y misma fecha o notario). Se revisa poco después de dejar de escribir.
const VACIO = { folio: [], escritura: [] };

export default function useCoincidencias(datos, excluir, activo = true) {
  const d = datos || {};
  const clave = activo ? JSON.stringify([d.folio_real, d.numero_escritura, d.fecha_escritura, d.notario_origen_completo, d.numero_credito, excluir]) : '';
  const [resultado, setResultado] = useState({ clave: '', datos: VACIO });

  useEffect(() => {
    if (!clave) return undefined;
    let vivo = true;
    const [folio, escritura, fecha, notario, credito, sin] = JSON.parse(clave);
    if (!folio && !escritura) return undefined;
    const t = setTimeout(() => {
      api.post('/expedientes/coincidencias', {
        datos: { folio_real: folio, numero_escritura: escritura, fecha_escritura: fecha, notario_origen_completo: notario, numero_credito: credito },
        excluir: sin || '',
      }, { sinActividad: true })
        .then((r) => { if (vivo) setResultado({ clave, datos: { folio: r.data?.folio || [], escritura: r.data?.escritura || [] } }); })
        .catch(() => {});
    }, 700);
    return () => { vivo = false; clearTimeout(t); };
  }, [clave]);

  return resultado.clave === clave ? resultado.datos : VACIO;
}

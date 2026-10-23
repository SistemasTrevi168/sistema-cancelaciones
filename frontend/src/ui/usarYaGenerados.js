import { useEffect, useState } from 'react';
import { api } from '../api';

// Revisa, al subir archivos, si su número de crédito (el del nombre del PDF) ya está en Mi Historial.
// Regresa { porArchivo: { nombre: info }, creditos: { credito: [info...] } }.
// No detiene nada: si no se puede revisar, simplemente no muestra avisos.

export const creditoDeNombre = (nombre) => (String(nombre || '').match(/(?<!\d)\d{8,12}(?!\d)/) || [null])[0];

// credito -> { lista, t }. Lo que no existía se vuelve a preguntar a los 15 s (pudo guardarse); lo que sí, a los 2 min.
const cache = new Map();
const vigente = (c) => {
  const e = cache.get(c);
  return !!e && Date.now() - e.t < (e.lista.length ? 120000 : 15000);
};

const ESTADO_TXT = { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' };
const fechaCorta = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
};

// Texto para mostrar del registro más reciente de ese crédito
export const describirGenerado = (lista) => {
  const r = lista?.[0];
  if (!r) return '';
  const partes = [
    r.acreditado || '',
    [fechaCorta(r.fecha), r.nombre_usuario ? `por ${r.nombre_usuario}` : ''].filter(Boolean).join(' '),
    ESTADO_TXT[r.estado] || r.estado || '',
  ].filter(Boolean);
  const veces = lista.length > 1 ? ` (${lista.length} veces)` : '';
  return partes.join(' · ') + veces;
};

export default function useYaGenerados(archivos, activo = true) {
  const nombres = (archivos || []).filter(Boolean).map((f) => f.name);
  const clave = nombres.join('|');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!activo) return undefined;
    const pendientes = [...new Set(clave.split('|').map(creditoDeNombre).filter((c) => c && !vigente(c)))];
    if (pendientes.length === 0) return undefined;
    let vivo = true;
    const t = setTimeout(async () => {
      for (let i = 0; i < pendientes.length; i += 250) {
        const bloque = pendientes.slice(i, i + 250);
        try {
          const r = (await api.get('/expedientes/repetidos', { params: { creditos: bloque.join(',') } })).data?.repetidos || {};
          bloque.forEach((c) => cache.set(c, { lista: r[c] || [], t: Date.now() }));
        } catch {
          return; // sin conexión o servidor viejo: no se avisa nada
        }
      }
      if (vivo) setVersion((v) => v + 1);
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [clave, activo]);

  const porArchivo = {};
  const creditos = {};
  if (activo) {
    nombres.forEach((n) => {
      const c = creditoDeNombre(n);
      const lista = c ? cache.get(c)?.lista : null;
      if (lista?.length) {
        porArchivo[n] = { credito: c, lista, texto: describirGenerado(lista) };
        creditos[c] = lista;
      }
    });
  }
  return { porArchivo, creditos, version };
}

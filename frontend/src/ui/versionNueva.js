import { useEffect, useState } from 'react';
import { api } from '../api';

// Avisa cuando se publicó una versión nueva del sistema (Vercel) mientras la página seguía abierta.
// Compara el archivo principal (assets/index-XXXX.js) de la página abierta con el que hay ahora en el servidor.
const PATRON = /\/assets\/index-[\w-]+\.js/;
const CADA = 2 * 60 * 1000;

const actual = () => {
  const s = document.querySelector('script[type="module"][src*="/assets/index-"]');
  return s ? (s.getAttribute('src').match(PATRON) || [null])[0] : null;
};

export default function useVersionNueva() {
  const [hayNueva, setHayNueva] = useState(false);
  useEffect(() => {
    const mia = actual();
    if (!mia) return undefined; // en desarrollo no hay archivo con huella
    let terminado = false;
    const revisar = async () => {
      if (terminado || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
        const html = await res.text();
        const servidor = (html.match(PATRON) || [null])[0];
        if (servidor && servidor !== mia) setHayNueva(true);
      } catch {
        // sin conexión: se revisa después
      }
    };
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    const reloj = setInterval(revisar, CADA);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    const primera = setTimeout(revisar, 15000);
    return () => {
      terminado = true;
      clearInterval(reloj); clearTimeout(primera);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, []);
  return hayNueva;
}

// Lo mismo para el servidor (Railway): si se publica una versión nueva del backend (plantillas, lectura de
// los PDF…), se avisa. No hace falta recargar: los cambios del servidor ya aplican en la siguiente acción.
const CADA_SERVIDOR = 3 * 60 * 1000;

export function useServidorNuevo(activo = true) {
  const [nuevo, setNuevo] = useState(null); // { commit, mensaje }
  useEffect(() => {
    if (!activo) return undefined;
    let primera = null;
    let terminado = false;
    const revisar = async () => {
      if (terminado || document.visibilityState !== 'visible') return;
      try {
        const r = await api.get('/version', { sinActividad: true, params: { t: Date.now() } });
        const v = r.data?.version;
        if (!v) return;
        if (primera === null) { primera = v; return; }
        if (v !== primera) { primera = v; setNuevo({ commit: r.data.commit || '', mensaje: r.data.mensaje || '' }); }
      } catch {
        // mientras se publica, el servidor no contesta unos segundos: se revisa después
      }
    };
    revisar();
    const reloj = setInterval(revisar, CADA_SERVIDOR);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { terminado = true; clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver); };
  }, [activo]);
  return [nuevo, () => setNuevo(null)];
}

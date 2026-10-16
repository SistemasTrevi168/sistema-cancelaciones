import { useEffect, useState } from 'react';

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

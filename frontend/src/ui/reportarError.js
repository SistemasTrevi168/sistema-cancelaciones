import { API_BASE, encabezadosSesion } from '../api';

// Manda al servidor los errores del navegador (quedan en el registro de Railway)
export function reportarError(error, donde = '') {
  try {
    fetch(`${API_BASE}/api/errores-cliente`, {
      method: 'POST',
      credentials: 'include',
      headers: encabezadosSesion({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        donde,
        mensaje: String(error?.message || error).slice(0, 500),
        pila: String(error?.stack || '').slice(0, 2000),
        pagina: window.location.href,
        navegador: navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* sin conexión */ }
}


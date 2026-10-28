import { useEffect, useRef } from 'react';
import { API_BASE, encabezadosSesion } from '../api';
import { emitir } from './eventosTiempoReal';

// Conexión en tiempo real con el servidor (Server-Sent Events leídos con fetch, para mandar la sesión
// también en el encabezado, como lo necesita Safari/iPhone).
//  - «notificaciones»: llegó o cambió una notificación -> se recargan al instante.
//  - «sesion_cerrada»: cerraron esta sesión en otro lado -> se sale al momento.
// Si la conexión se corta, se reconecta sola (y al volver a la pestaña).
export default function useTiempoReal(activo, { onNotificaciones, onSesionCerrada }) {
  const cb = useRef({});
  useEffect(() => { cb.current = { onNotificaciones, onSesionCerrada }; });

  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true;
    let control = null;
    let reintento = null;
    let espera = 1000;

    const procesar = (bloque) => {
      let tipo = 'mensaje';
      let datos = '';
      bloque.split('\n').forEach((l) => {
        if (l.startsWith('event:')) tipo = l.slice(6).trim();
        else if (l.startsWith('data:')) datos += l.slice(5).trim();
      });
      let d;
      try { d = JSON.parse(datos || '{}'); } catch { d = {}; }
      emitir(tipo, d);
      if (tipo === 'notificaciones') cb.current.onNotificaciones?.(d);
      if (tipo === 'sesion_cerrada') {
        vivo = false;
        cb.current.onSesionCerrada?.(d.motivo || 'cerrada');
      }
    };

    const conectar = async () => {
      if (!vivo) return;
      clearTimeout(reintento);
      control = new AbortController();
      try {
        const res = await fetch(`${API_BASE}/api/eventos`, {
          headers: encabezadosSesion({ Accept: 'text/event-stream' }),
          credentials: 'include',
          cache: 'no-store',
          signal: control.signal,
        });
        if (!res.ok || !res.body) throw new Error('sin conexión en tiempo real');
        espera = 1000;
        const lector = res.body.getReader();
        const decodificador = new TextDecoder();
        let pendiente = '';
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          pendiente += decodificador.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let i = pendiente.indexOf('\n\n');
          while (i >= 0) {
            procesar(pendiente.slice(0, i));
            pendiente = pendiente.slice(i + 2);
            i = pendiente.indexOf('\n\n');
          }
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
      if (!vivo) return;
      reintento = setTimeout(conectar, espera);
      espera = Math.min(espera * 2, 30000);
    };

    // Al volver a la pestaña (en celular la conexión se duerme) se reconecta enseguida
    const alVolver = () => {
      if (document.visibilityState !== 'visible' || !vivo) return;
      control?.abort();
      espera = 1000;
      conectar();
    };
    conectar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', alVolver);
    return () => {
      vivo = false;
      control?.abort();
      clearTimeout(reintento);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', alVolver);
    };
  }, [activo]);
}

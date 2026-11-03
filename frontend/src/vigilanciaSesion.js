import { useEffect, useRef } from 'react';
import { api, hayPeticionesEnCurso } from './api';

// Vigila la sesión mientras la persona está dentro del sistema:
//  - Cada 5 segundos le pregunta al servidor si la sesión sigue abierta. Si la cerraron desde otro
//    dispositivo (o cambiaron la contraseña, o desactivaron al usuario) se sale de inmediato.
//  - Ya NO se cierra por inactividad. Si al entrar no se marcó «Mantener la sesión activa en este
//    dispositivo», la sesión se cierra sola al terminar el horario (el servidor dice a qué hora):
//    5 minutos antes aparece un aviso para guardar lo pendiente.
//  - La actividad (mouse, teclado, toques) solo se usa para mostrar el «último uso» en Mi perfil.
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'];
const AVISAR_ANTES = 300; // segundos antes del cierre se muestra el aviso

export default function useVigilanciaSesion({ activo, onExpirar, onAviso, onFunciones }) {
  const usado = useRef(false);
  const cierre = useRef(null); // { t: ms, mantener: bool }
  const descartado = useRef(0); // hasta cuándo no se vuelve a mostrar el aviso
  const callbacks = useRef({ onExpirar, onAviso });
  useEffect(() => { callbacks.current = { onExpirar, onAviso, onFunciones }; });

  useEffect(() => {
    if (!activo) return undefined;
    let terminado = false;
    cierre.current = null;
    descartado.current = 0;

    const expirar = (motivo) => {
      if (terminado) return;
      terminado = true;
      callbacks.current.onAviso?.(null);
      callbacks.current.onExpirar?.(motivo, 0);
    };
    const marcar = () => { usado.current = true; };

    const revisar = () => {
      if (terminado) return;
      const c = cierre.current;
      if (!c || c.mantener) { callbacks.current.onAviso?.(null); return; }
      const restante = Math.ceil((c.t - Date.now()) / 1000);
      if (restante <= 0) {
        // Se confirma con el servidor (por si el reloj de la computadora está adelantado)
        ping();
        return;
      }
      const mostrar = restante <= AVISAR_ANTES && (Date.now() >= descartado.current || restante <= 60);
      callbacks.current.onAviso?.(mostrar ? { segundos: restante, hora: c.t } : null);
    };

    const ping = async () => {
      if (terminado) return;
      const activoAhora = usado.current || hayPeticionesEnCurso();
      usado.current = false;
      try {
        const res = await api.get('/auth/ping', { params: { activo: activoAhora ? 1 : 0 }, sinActividad: true });
        const d = res.data || {};
        if (d.activa) {
          callbacks.current.onFunciones?.(d.funciones || []);
          const t = d.cierra_en ? Date.parse(d.cierra_en) : NaN;
          cierre.current = Number.isNaN(t) ? null : { t, mantener: !!d.mantener };
        }
        if (d.activa === false) expirar(d.motivo || 'cerrada');
      } catch {
        // sin conexión: se vuelve a intentar en el siguiente ciclo
      }
    };

    const alVolver = () => {
      if (document.visibilityState === 'visible') { ping(); revisar(); }
    };

    EVENTOS.forEach((ev) => window.addEventListener(ev, marcar, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    const reloj = setInterval(revisar, 1000);
    const latido = setInterval(ping, 5000);
    ping();

    return () => {
      terminado = true;
      EVENTOS.forEach((ev) => window.removeEventListener(ev, marcar, { capture: true }));
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      clearInterval(reloj);
      clearInterval(latido);
      callbacks.current.onAviso?.(null);
    };
  }, [activo]);

  // Botón «Entendido» del aviso: no se vuelve a mostrar hasta el último minuto
  return () => { descartado.current = Date.now() + 10 * 60 * 1000; };
}

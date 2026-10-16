import { useEffect, useRef } from 'react';
import { api, hayPeticionesEnCurso } from './api';

// Vigila la sesión mientras la persona está dentro del sistema:
//  - Cada 5 segundos le pregunta al servidor si la sesión sigue abierta. Si la cerraron desde otro
//    dispositivo (o cambiaron la contraseña, o desactivaron al usuario) se sale de inmediato.
//  - Si pasa el tiempo de inactividad (2 minutos) sin mover el mouse, tocar o escribir, la sesión se cierra.
//    Mientras se lee o se guarda algo (peticiones en curso) no cuenta como inactividad.
//  - La actividad se comparte entre pestañas del mismo navegador.
const CLAVE = 'ultima_actividad';
const EVENTOS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input', 'scroll'];
const AVISAR_ANTES = 15; // segundos antes de cerrar se muestra el aviso

const leer = () => { try { return Number(localStorage.getItem(CLAVE)) || 0; } catch { return 0; } };
const guardar = (t) => { try { localStorage.setItem(CLAVE, String(t)); } catch { /* sin almacenamiento */ } };

export default function useVigilanciaSesion({ activo, onExpirar, onAviso }) {
  const ultima = useRef(0);
  const desdePing = useRef(false);
  const limite = useRef(120);
  const callbacks = useRef({ onExpirar, onAviso });
  useEffect(() => { callbacks.current = { onExpirar, onAviso }; });

  useEffect(() => {
    if (!activo) return undefined;
    let terminado = false;
    let ultimaEscritura = 0;
    ultima.current = Date.now();
    guardar(ultima.current);

    const expirar = (motivo) => {
      if (terminado) return;
      terminado = true;
      callbacks.current.onAviso?.(null);
      callbacks.current.onExpirar?.(motivo, limite.current);
    };
    const marcar = () => {
      const ahora = Date.now();
      ultima.current = ahora;
      desdePing.current = true;
      if (ahora - ultimaEscritura > 1000) { ultimaEscritura = ahora; guardar(ahora); }
    };
    const inactivoSeg = () => (Date.now() - Math.max(ultima.current, leer())) / 1000;

    const revisar = () => {
      if (terminado) return;
      if (hayPeticionesEnCurso()) marcar();
      const seg = inactivoSeg();
      if (seg >= limite.current) { expirar('inactividad'); return; }
      const restante = Math.ceil(limite.current - seg);
      callbacks.current.onAviso?.(restante <= AVISAR_ANTES ? restante : null);
    };

    const ping = async () => {
      if (terminado) return;
      const activoAhora = desdePing.current || inactivoSeg() < 5;
      desdePing.current = false;
      try {
        const res = await api.get('/auth/ping', { params: { activo: activoAhora ? 1 : 0 }, sinActividad: true });
        if (res.data?.inactividad_segundos) limite.current = res.data.inactividad_segundos;
        if (res.data && res.data.activa === false) expirar(res.data.motivo || 'cerrada');
      } catch {
        // sin conexión: se vuelve a intentar en el siguiente ciclo
      }
    };

    const alVolver = () => {
      if (document.visibilityState === 'visible') { revisar(); ping(); }
    };
    const alCambiarOtraPestana = (e) => { if (e.key === CLAVE) desdePing.current = true; };

    EVENTOS.forEach((ev) => window.addEventListener(ev, marcar, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    window.addEventListener('storage', alCambiarOtraPestana);
    const reloj = setInterval(revisar, 1000);
    const latido = setInterval(ping, 5000);
    ping();

    return () => {
      terminado = true;
      EVENTOS.forEach((ev) => window.removeEventListener(ev, marcar, { capture: true }));
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('storage', alCambiarOtraPestana);
      clearInterval(reloj);
      clearInterval(latido);
      callbacks.current.onAviso?.(null);
    };
  }, [activo]);

  // Para el botón "Seguir trabajando"
  return () => { ultima.current = Date.now(); desdePing.current = true; guardar(ultima.current); };
}

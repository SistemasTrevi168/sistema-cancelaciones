import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { avisar } from './notificaciones';

// Notificaciones del usuario (campana): se revisan al entrar, cada 45 s y al volver a la pestaña.
// Las que llegan mientras la persona está en el sistema se avisan también con un mensaje flotante.
const VACIO = { no_leidas: 0, lista: [] };

export default function useNotificaciones(activo, alLlegar) {
  const [estado, setEstado] = useState(VACIO);
  const conocidas = useRef(null); // ids ya vistos en esta sesión (null = todavía no se cargan)
  const alLlegarRef = useRef(alLlegar);
  useEffect(() => { alLlegarRef.current = alLlegar; });

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/notificaciones');
      const lista = r.data?.notificaciones || [];
      const noLeidas = r.data?.no_leidas || 0;
      if (conocidas.current === null) {
        // Al entrar: un solo aviso con lo pendiente
        if (noLeidas === 1) avisar.info(lista.find((n) => !n.leida)?.titulo || 'Tienes una notificación nueva.');
        else if (noLeidas > 1) avisar.info(`Tienes ${noLeidas} notificaciones nuevas.`);
        if (noLeidas > 0) alLlegarRef.current?.(lista.filter((n) => !n.leida));
      } else {
        const nuevas = lista.filter((n) => !n.leida && !conocidas.current.has(n.id));
        nuevas.slice(0, 3).forEach((n) => avisar.info(n.titulo));
        if (nuevas.length) alLlegarRef.current?.(nuevas);
      }
      conocidas.current = new Set(lista.map((n) => n.id));
      setEstado({ no_leidas: noLeidas, lista });
    } catch {
      // sin conexión o servidor sin esta función: no se muestra nada
    }
  }, []);

  useEffect(() => {
    if (!activo) { conocidas.current = null; return undefined; }
    const primera = setTimeout(cargar, 1500);
    const intervalo = setInterval(cargar, 45000);
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearTimeout(primera); clearInterval(intervalo); document.removeEventListener('visibilitychange', alVolver); };
  }, [activo, cargar]);

  const marcarLeidas = useCallback(async (ids = null) => {
    setEstado((e) => {
      const lista = e.lista.map((n) => (!ids || ids.includes(n.id) ? { ...n, leida: true } : n));
      const marcadas = e.lista.filter((n) => !n.leida && (!ids || ids.includes(n.id))).length;
      return { lista, no_leidas: Math.max(0, e.no_leidas - marcadas) };
    });
    try { await api.post('/notificaciones/leer', ids ? { ids } : { todas: true }); } catch { /* se reintenta al recargar */ }
  }, []);

  return { ...(activo ? estado : VACIO), recargar: cargar, marcarLeidas };
}

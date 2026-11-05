import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, api, encabezadosSesion } from '../api';

// Subrayados de los PDF del visor. Se guardan en el servidor por la «huella» del archivo (sha256 de su
// contenido): el mismo PDF muestra sus subrayados al generar, en la carga masiva y al editar el expediente.
export const COLORES_SUBRAYADO = [
  { id: 'amarillo', nombre: 'Amarillo', color: '#fde047' },
  { id: 'verde', nombre: 'Verde', color: '#86efac' },
  { id: 'azul', nombre: 'Azul', color: '#93c5fd' },
  { id: 'rosa', nombre: 'Rosa', color: '#f9a8d4' },
  { id: 'naranja', nombre: 'Naranja', color: '#fdba74' },
];
export const colorSubrayado = (id) => (COLORES_SUBRAYADO.find((c) => c.id === id) || COLORES_SUBRAYADO[0]).color;

const huellas = new WeakMap();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export function huellaDe(archivo) {
  if (!archivo) return Promise.resolve(null);
  if (!huellas.has(archivo)) {
    const p = (window.crypto?.subtle && archivo.arrayBuffer)
      ? archivo.arrayBuffer().then((d) => window.crypto.subtle.digest('SHA-256', d)).then(hex).catch(() => null)
      : Promise.resolve(null);
    huellas.set(archivo, p);
  }
  return huellas.get(archivo);
}

// Copia en este navegador por si no hay conexión con el servidor en ese momento
const local = {
  leer(h) { try { return JSON.parse(localStorage.getItem(`subrayados:${h}`) || 'null'); } catch { return null; } },
  escribir(h, m) { try { if (m.length) localStorage.setItem(`subrayados:${h}`, JSON.stringify(m)); else localStorage.removeItem(`subrayados:${h}`); } catch { /* sin espacio */ } },
};

export function useSubrayados(archivo) {
  const [marcas, setMarcas] = useState([]);
  const [huella, setHuella] = useState(null);
  const [estado, setEstado] = useState('cargando'); // cargando | listo | guardando | error
  const pendiente = useRef(null); // { huella, marcas } por guardar
  const reloj = useRef(null);

  const enviar = useCallback(async () => {
    clearTimeout(reloj.current);
    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;
    try {
      await api.put(`/subrayados/${p.huella}`, { marcas: p.marcas });
      setEstado((e) => (e === 'guardando' ? 'listo' : e));
    } catch {
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    huellaDe(archivo).then(async (h) => {
      if (!vivo) return;
      setMarcas([]); setHuella(h);
      if (!h) { setEstado('listo'); return; }
      setEstado('cargando');
      try {
        const r = await api.get(`/subrayados/${h}`);
        if (!vivo) return;
        const m = Array.isArray(r.data?.marcas) ? r.data.marcas : [];
        const copia = local.leer(h);
        // Si en este navegador quedaron cambios sin subir (no había conexión), se suben ahora
        if (copia && copia.pendiente && Array.isArray(copia.marcas)) {
          setMarcas(copia.marcas);
          pendiente.current = { huella: h, marcas: copia.marcas };
          enviar().then(() => local.escribir(h, []));
        } else {
          setMarcas(m);
        }
        setEstado('listo');
      } catch {
        if (!vivo) return;
        const copia = local.leer(h);
        setMarcas(Array.isArray(copia?.marcas) ? copia.marcas : []);
        setEstado('error');
      }
    });
    return () => { vivo = false; enviar(); };
  }, [archivo, enviar]);

  const cambiar = useCallback((fn) => {
    setMarcas((antes) => {
      const nuevas = fn(antes);
      if (huella) {
        pendiente.current = { huella, marcas: nuevas };
        local.escribir(huella, nuevas.length ? { pendiente: true, marcas: nuevas } : []);
        setEstado('guardando');
        clearTimeout(reloj.current);
        reloj.current = setTimeout(() => {
          enviar().then(() => { if (!pendiente.current) local.escribir(huella, []); });
        }, 700);
      }
      return nuevas;
    });
  }, [huella, enviar]);

  const agregar = useCallback((nuevas) => cambiar((m) => [...m, ...nuevas]), [cambiar]);
  const quitar = useCallback((id) => cambiar((m) => m.filter((x) => x.id !== id)), [cambiar]);
  const recolorear = useCallback((id, color) => cambiar((m) => m.map((x) => (x.id === id ? { ...x, color } : x))), [cambiar]);
  const limpiar = useCallback(() => cambiar(() => []), [cambiar]);

  // Al cerrar o recargar la página se manda lo pendiente
  useEffect(() => {
    const salir = () => {
      const p = pendiente.current;
      if (!p) return;
      try {
        fetch(`${API_BASE}/api/subrayados/${p.huella}`, {
          method: 'PUT', keepalive: true, credentials: 'include',
          headers: encabezadosSesion({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ marcas: p.marcas }),
        });
      } catch { /* queda la copia local */ }
    };
    window.addEventListener('pagehide', salir);
    return () => window.removeEventListener('pagehide', salir);
  }, []);

  return { marcas, huella, estado, agregar, quitar, recolorear, limpiar, disponible: !!huella };
}

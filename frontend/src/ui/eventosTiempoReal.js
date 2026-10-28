// Avisos del servidor en tiempo real repartidos dentro de la app (p. ej. «sesiones» para Mi perfil)
const oyentes = new Map(); // tipo -> Set(fn)

export function escuchar(tipo, fn) {
  if (!oyentes.has(tipo)) oyentes.set(tipo, new Set());
  oyentes.get(tipo).add(fn);
  return () => oyentes.get(tipo)?.delete(fn);
}

export function emitir(tipo, datos) {
  (oyentes.get(tipo) || []).forEach((fn) => {
    try { fn(datos); } catch { /* un oyente con error no detiene a los demás */ }
  });
}

// Avisos flotantes y ventanas de confirmación del sistema
// (reemplazan a alert() y confirm() del navegador).
//
// Uso:
//   avisar.exito('Usuario creado');
//   avisar.error('No se pudo guardar');
//   if (!(await confirmar('¿Eliminar?', { titulo: 'Eliminar usuario', peligro: true }))) return;

let estado = { avisos: [], confirmacion: null };
const oyentes = new Set();
let siguienteId = 0;

function emitir() {
  oyentes.forEach((fn) => fn(estado));
}

export function suscribir(fn) {
  oyentes.add(fn);
  fn(estado);
  return () => oyentes.delete(fn);
}

// Cuánto se ve cada aviso y cuánto dura el desvanecido
const DURACION_AVISO = 3000;
const DURACION_SALIDA = 450;
const temporizadores = new Map();

function quitarDeLista(id) {
  temporizadores.delete(id);
  estado = { ...estado, avisos: estado.avisos.filter((a) => a.id !== id) };
  emitir();
}

// Se desvanece suavemente y después se quita
export function quitarAviso(id) {
  const aviso = estado.avisos.find((a) => a.id === id);
  if (!aviso || aviso.saliendo) return;
  clearTimeout(temporizadores.get(id));
  estado = { ...estado, avisos: estado.avisos.map((a) => (a.id === id ? { ...a, saliendo: true } : a)) };
  emitir();
  temporizadores.set(id, setTimeout(() => quitarDeLista(id), DURACION_SALIDA));
}

function programarSalida(id, ms) {
  clearTimeout(temporizadores.get(id));
  temporizadores.set(id, setTimeout(() => quitarAviso(id), ms));
}

// Mientras el mouse está encima, el aviso no se va (para poder leerlo)
export function pausarAviso(id) {
  const aviso = estado.avisos.find((a) => a.id === id);
  if (aviso && !aviso.saliendo) clearTimeout(temporizadores.get(id));
}
export function reanudarAviso(id) {
  const aviso = estado.avisos.find((a) => a.id === id);
  if (aviso && !aviso.saliendo) programarSalida(id, 1500);
}

function agregarAviso(tipo, mensaje) {
  const id = ++siguienteId;
  // Máximo 4 avisos a la vez: los más viejos se desvanecen
  const visibles = estado.avisos.filter((a) => !a.saliendo);
  estado = { ...estado, avisos: [...estado.avisos, { id, tipo, mensaje: String(mensaje ?? '') }] };
  emitir();
  visibles.slice(0, Math.max(0, visibles.length - 3)).forEach((a) => quitarAviso(a.id));
  programarSalida(id, DURACION_AVISO);
}

export const avisar = {
  exito: (mensaje) => agregarAviso('exito', mensaje),
  info: (mensaje) => agregarAviso('info', mensaje),
  aviso: (mensaje) => agregarAviso('aviso', mensaje),
  error: (mensaje) => agregarAviso('error', mensaje),
};

export function confirmar(mensaje, opciones = {}) {
  return new Promise((resolve) => {
    // Si ya había una confirmación abierta, se cancela
    if (estado.confirmacion) estado.confirmacion.responder(false);
    const confirmacion = {
      mensaje: String(mensaje ?? ''),
      titulo: opciones.titulo || '¿Deseas continuar?',
      textoConfirmar: opciones.textoConfirmar || 'Sí, continuar',
      textoCancelar: opciones.textoCancelar || 'Cancelar',
      peligro: !!opciones.peligro,
      responder: (valor) => {
        if (estado.confirmacion === confirmacion) {
          estado = { ...estado, confirmacion: null };
          emitir();
        }
        resolve(valor);
      },
    };
    estado = { ...estado, confirmacion };
    emitir();
  });
}

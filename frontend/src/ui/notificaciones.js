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

export function quitarAviso(id) {
  estado = { ...estado, avisos: estado.avisos.filter((a) => a.id !== id) };
  emitir();
}

function agregarAviso(tipo, mensaje, duracion) {
  const id = ++siguienteId;
  // Máximo 4 avisos a la vez: se quitan los más viejos
  const avisos = [...estado.avisos, { id, tipo, mensaje: String(mensaje ?? '') }].slice(-4);
  estado = { ...estado, avisos };
  emitir();
  setTimeout(() => quitarAviso(id), duracion);
}

export const avisar = {
  exito: (mensaje) => agregarAviso('exito', mensaje, 3500),
  info: (mensaje) => agregarAviso('info', mensaje, 4000),
  aviso: (mensaje) => agregarAviso('aviso', mensaje, 5000),
  error: (mensaje) => agregarAviso('error', mensaje, 7000),
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

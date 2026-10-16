// Efecto de "onda" al hacer clic en cualquier botón del sistema.
// Se instala una sola vez y funciona con todos los botones, sin tocarlos uno por uno.

export function instalarEfectoOnda() {
  const alPresionar = (e) => {
    const boton = e.target.closest?.('button');
    if (!boton || boton.disabled || boton.dataset.sinOnda !== undefined) return;
    // En celular / tablet (toque) no hay onda: Safari de iPhone no la recorta y deja manchas de color
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    // La navegación del celular tiene su propia respuesta al toque (sin onda)
    if (boton.closest('.nav-movil-raiz, .barra-movil')) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const rect = boton.getBoundingClientRect();
    const tam = Math.max(rect.width, rect.height) * 2;
    const onda = document.createElement('span');
    onda.className = 'onda-clic';
    onda.style.width = onda.style.height = `${tam}px`;
    onda.style.left = `${e.clientX - rect.left - tam / 2}px`;
    onda.style.top = `${e.clientY - rect.top - tam / 2}px`;

    boton.classList.add('con-onda');
    boton.appendChild(onda);
    onda.addEventListener('animationend', () => {
      onda.remove();
      if (!boton.querySelector('.onda-clic')) boton.classList.remove('con-onda');
    });
  };
  document.addEventListener('pointerdown', alPresionar);
  return () => document.removeEventListener('pointerdown', alPresionar);
}

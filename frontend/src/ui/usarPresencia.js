import { useEffect, useState } from 'react';

// Mantiene un menú "montado" unos milisegundos después de cerrarlo, para que alcance a salir con animación.
// Regresa { montado, saliendo }: se dibuja mientras montado, y con la clase de salida mientras saliendo.
export default function usePresencia(abierto, ms = 150) {
  const [visible, setVisible] = useState(abierto);
  if (abierto && !visible) setVisible(true);
  useEffect(() => {
    if (abierto || !visible) return undefined;
    const t = setTimeout(() => setVisible(false), ms);
    return () => clearTimeout(t);
  }, [abierto, visible, ms]);
  return { montado: visible || abierto, saliendo: visible && !abierto };
}

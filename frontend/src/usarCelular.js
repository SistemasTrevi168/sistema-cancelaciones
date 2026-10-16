import { useEffect, useState } from 'react';

// true si la pantalla es de celular (hasta 768 px de ancho)
export default function useCelular(consulta = '(max-width: 768px)') {
  const [es, setEs] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(consulta);
    if (!mq) return undefined;
    const cambio = (e) => setEs(e.matches);
    mq.addEventListener('change', cambio);
    return () => mq.removeEventListener('change', cambio);
  }, [consulta]);
  return es;
}

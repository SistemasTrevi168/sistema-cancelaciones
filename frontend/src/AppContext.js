import { createContext, useContext } from 'react';

// Estado compartido entre App y sus pantallas (components/)
export const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

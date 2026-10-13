import axios from 'axios';

// Configuración producción / Railway
axios.defaults.withCredentials = true;

// Dirección única del backend (la misma que ya usa el login). Si cambia el dominio en Railway, solo se edita aquí.
export const API_BASE = 'https://sistema-cancelaciones-production-3c4b.up.railway.app';

export const api = axios.create({
baseURL: `${API_BASE}/api`,
  withCredentials: true // <--- CRUCIAL para cookies
});

// 🛡️ Interceptor para manejar respuestas y filtrar ruidos de 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si la sesión no es válida (401), es un comportamiento esperado al abrir la app sin loguearse
    if (error.response && error.response.status === 401) {
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

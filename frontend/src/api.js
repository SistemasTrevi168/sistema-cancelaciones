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

// ---------- Sesión por encabezado (necesario en iPhone/Safari) ----------
// Safari bloquea las cookies entre sitios distintos (vercel.app ↔ railway.app),
// así que además de la cookie se manda el identificador de sesión en "Authorization".
const CLAVE_TOKEN = 'sesion_token';

export function guardarToken(token) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch { /* navegación privada sin almacenamiento */ }
}

export function leerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

// Encabezados para las llamadas hechas con fetch()
export function encabezadosSesion(extra = {}) {
  const token = leerToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

api.interceptors.request.use((config) => {
  const token = leerToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si el servidor dice que la sesión ya no es válida, la app regresa al login
let alExpirar = null;
export function alExpirarSesion(fn) {
  alExpirar = fn;
}
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/login') && alExpirar) alExpirar();
    return Promise.reject(error);
  }
);

import { Clock, LogIn, MonitorSmartphone, ShieldAlert } from 'lucide-react';

const MENSAJES = {
  inactividad: {
    icono: Clock,
    titulo: 'Tu sesión expiró',
    texto: 'Pasó 1 minuto sin actividad en el sistema y la sesión se cerró para proteger la información. Vuelve a iniciar sesión para continuar.',
  },
  otro_dispositivo: {
    icono: MonitorSmartphone,
    titulo: 'Se cerró tu sesión',
    texto: 'Tu sesión se cerró desde otro dispositivo. Si no fuiste tú, cambia tu contraseña al entrar.',
  },
  contrasena: {
    icono: ShieldAlert,
    titulo: 'Tu contraseña cambió',
    texto: 'La contraseña de tu cuenta se cambió y la sesión se cerró. Entra con la contraseña nueva.',
  },
  cerrada: {
    icono: ShieldAlert,
    titulo: 'Se cerró tu sesión',
    texto: 'Tu sesión se cerró o expiró. Vuelve a iniciar sesión para continuar.',
  },
};

// Ventana que aparece sobre el login cuando la sesión se cerró sola
export function AvisoSesionCerrada({ motivo, onAceptar, theme, isDarkMode }) {
  const m = MENSAJES[motivo] || MENSAJES.cerrada;
  const Icono = m.icono;
  return (
    <div className="fondo-modal aviso-sesion-fondo" role="alertdialog" aria-modal="true" aria-labelledby="aviso-sesion-titulo">
      <div className="aviso-sesion modal-entrada" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
        <span className="aviso-sesion-icono" style={{ backgroundColor: isDarkMode ? '#422006' : '#fffbeb', color: '#d97706' }}><Icono size={26} /></span>
        <h3 id="aviso-sesion-titulo">{m.titulo}</h3>
        <p style={{ color: theme.textSecondary }}>{m.texto}</p>
        <button type="button" autoFocus onClick={onAceptar} className="aviso-sesion-boton" style={{ backgroundColor: theme.accent }}>
          <LogIn size={16} /> Iniciar sesión
        </button>
      </div>
    </div>
  );
}

// Aviso de los últimos segundos antes de cerrar por inactividad
export function AvisoInactividad({ segundos, onSeguir, theme }) {
  return (
    <div className="aviso-inactividad" role="alert" style={{ backgroundColor: theme.cardBg, borderColor: '#f59e0b', color: theme.textPrimary }}>
      <span className="aviso-inactividad-contador" style={{ '--avance': `${(segundos / 15) * 100}%` }}>{segundos}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>¿Sigues ahí?</strong>
        <small style={{ color: theme.textSecondary }}>Por inactividad, tu sesión se cerrará en {segundos} s.</small>
      </div>
      <button type="button" onClick={onSeguir} style={{ backgroundColor: theme.accent }}>Seguir trabajando</button>
    </div>
  );
}

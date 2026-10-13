import { useState } from 'react';
import {
  AlertCircle, ArrowRight, Eye, EyeOff, FileText, Layers, Loader2, Lock, Moon, ShieldCheck, Sun, User,
} from 'lucide-react';
import { useApp } from '../AppContext';

const BENEFICIOS = [
  { icono: FileText, titulo: 'Extracción automática', texto: 'Lee los datos de las constancias y cartas en PDF.' },
  { icono: Layers, titulo: 'Carga masiva y por Excel', texto: 'Genera decenas de cancelaciones en un solo paso.' },
  { icono: ShieldCheck, titulo: 'Acceso seguro', texto: 'Cada usuario ve únicamente sus expedientes.' },
];

export default function LoginScreen() {
  const {
    handleLogin,
    isDarkMode,
    isLoggingIn,
    loginError,
    loginPassword,
    loginUser,
    setLoginPassword,
    setLoginUser,
    theme,
    toggleTheme
  } = useApp();
  const [verPassword, setVerPassword] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);

  const revisarMayusculas = (e) => setMayusculas(!!e.getModifierState?.('CapsLock'));

  const campo = {
    display: 'flex', alignItems: 'center', gap: '10px',
    border: `1.5px solid ${theme.border}`, borderRadius: '12px', padding: '0 14px',
    backgroundColor: theme.inputBg,
  };
  const input = {
    width: '100%', padding: '13px 0', border: 'none', outline: 'none', fontSize: '15px',
    backgroundColor: 'transparent', color: theme.textPrimary, fontFamily: 'inherit',
  };

  return (
    <div className="login-pantalla" style={{ backgroundColor: theme.bg }}>
      {/* PANEL DE MARCA (izquierda) */}
      <section className="login-marca" aria-hidden="true">
        <span className="burbuja burbuja-1" />
        <span className="burbuja burbuja-2" />
        <span className="burbuja burbuja-3" />
        <div className="login-marca-contenido">
          <div className="login-logo login-entrada" style={{ animationDelay: '0.05s' }}>
            <FileText size={28} color="#2563eb" strokeWidth={2.2} />
          </div>
          <h1 className="login-entrada" style={{ animationDelay: '0.12s' }}>Cancelación de Hipotecas</h1>
          <p className="login-subtitulo login-entrada" style={{ animationDelay: '0.18s' }}>
            Gestión notarial de cancelaciones, del PDF al Word en minutos.
          </p>
          <ul className="login-beneficios">
            {BENEFICIOS.map(({ icono: Icono, titulo, texto }, i) => (
              <li key={titulo} className="login-entrada" style={{ animationDelay: `${0.28 + i * 0.1}s` }}>
                <span className="login-beneficio-icono"><Icono size={18} /></span>
                <div>
                  <strong>{titulo}</strong>
                  <span>{texto}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="login-pie">© {new Date().getFullYear()} · Sistema de Cancelaciones</p>
      </section>

      {/* FORMULARIO (derecha) */}
      <section className="login-formulario-zona">
        <button
          type="button"
          onClick={toggleTheme}
          className="login-tema"
          aria-label={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          style={{ color: theme.textSecondary, border: `1px solid ${theme.border}`, backgroundColor: theme.cardBg }}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="login-tarjeta" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
          <div className="login-logo-movil">
            <FileText size={24} color="#fff" />
          </div>
          <h2 className="login-entrada" style={{ color: theme.textPrimary, animationDelay: '0.1s' }}>Bienvenido</h2>
          <p className="login-entrada" style={{ color: theme.textSecondary, animationDelay: '0.15s', margin: '0 0 28px 0', fontSize: '14px' }}>
            Ingresa con tu usuario para continuar.
          </p>

          {loginError && (
            <div role="alert" className="login-error" style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', color: isDarkMode ? '#fca5a5' : '#991b1b', border: `1px solid ${isDarkMode ? '#7f1d1d' : '#fecaca'}` }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} noValidate={false}>
            <div className="login-entrada" style={{ marginBottom: '18px', animationDelay: '0.2s' }}>
              <label htmlFor="login-usuario" className="login-etiqueta" style={{ color: theme.textSecondary }}>Usuario</label>
              <div className="login-campo" style={campo}>
                <User size={18} color={theme.textSecondary} />
                <input
                  id="login-usuario"
                  type="text"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  disabled={isLoggingIn}
                  placeholder="Tu nombre de usuario"
                  style={input}
                />
              </div>
            </div>

            <div className="login-entrada" style={{ marginBottom: '8px', animationDelay: '0.26s' }}>
              <label htmlFor="login-password" className="login-etiqueta" style={{ color: theme.textSecondary }}>Contraseña</label>
              <div className="login-campo" style={campo}>
                <Lock size={18} color={theme.textSecondary} />
                <input
                  id="login-password"
                  type={verPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyUp={revisarMayusculas}
                  onKeyDown={revisarMayusculas}
                  autoComplete="current-password"
                  required
                  disabled={isLoggingIn}
                  placeholder="••••••••"
                  style={input}
                />
                <button
                  type="button"
                  onClick={() => setVerPassword(!verPassword)}
                  aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  data-sin-onda
                  style={{ background: 'transparent', border: 'none', color: theme.textSecondary, cursor: 'pointer', display: 'flex', padding: '4px' }}
                >
                  {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div style={{ minHeight: '22px', marginBottom: '14px' }}>
              {mayusculas && (
                <span className="login-mayusculas">Bloq Mayús está activado</span>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className={`login-boton login-entrada ${loginUser && loginPassword ? 'listo' : ''} ${isLoggingIn ? 'cargando' : ''}`}
              style={{ animationDelay: '0.32s', '--fondo-boton': isDarkMode ? '#1e293b' : '#eff6ff' }}
            >
              {isLoggingIn ? (
                <span className="login-boton-texto"><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Verificando…</span>
              ) : (
                <span className="login-boton-texto">Ingresar <ArrowRight size={18} className="login-boton-flecha" /></span>
              )}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

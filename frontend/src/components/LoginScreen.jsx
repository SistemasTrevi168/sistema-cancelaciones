import { AlertCircle, Loader2, Lock, Moon, Sun, User } from 'lucide-react';
import { useApp } from '../AppContext';

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

  return (
<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: isDarkMode ? '#0b0f19' : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}>
          {/* Tarjeta de login animada */}
          <div className="slide-up" style={{ maxWidth: '420px', width: '100%', backgroundColor: theme.cardBg, padding: '40px 32px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button onClick={toggleTheme} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textSecondary }}>
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
            {isLoggingIn ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Loader2 size={48} color={theme.accent} style={{ margin: '0 auto 20px auto', display: 'block', animation: 'spin 1s linear infinite' }} />
                <h3 style={{ margin: '0 0 8px 0', color: theme.textPrimary, fontSize: '18px', fontWeight: '600' }}>Cargando perfil...</h3>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <div style={{ backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff', width: '64px', height: '64px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                    <Lock color={theme.accent} size={30} />
                  </div>
                  <h2 style={{ margin: '0 0 6px 0', color: theme.textPrimary, fontSize: '24px', fontWeight: '700' }}>Acceso al Sistema</h2>
                </div>

                {loginError && (
                  <div style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', borderLeft: '4px solid #ef4444', color: isDarkMode ? '#fca5a5' : '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertCircle size={18} />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleLogin}>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '8px' }}>Usuario</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '0 14px', backgroundColor: theme.inputBg }}>
                      <User size={18} color={theme.textSecondary} />
                      <input
                        type="text"
                        value={loginUser}
                        onChange={(e) => setLoginUser(e.target.value)}
                        required
                        style={{ width: '100%', padding: '12px 10px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent', color: theme.textPrimary }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '28px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '8px' }}>Contraseña</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '0 14px', backgroundColor: theme.inputBg }}>
                      <Lock size={18} color={theme.textSecondary} />
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        style={{ width: '100%', padding: '12px 10px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent', color: theme.textPrimary }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="pulse-hover"
                    style={{ width: '100%', backgroundColor: theme.accent, color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: '600', fontSize: '15px', cursor: 'pointer' }}
                  >
                    Ingresar a mi Perfil
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
  );
}


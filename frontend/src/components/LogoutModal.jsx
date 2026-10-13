import { LogOut } from 'lucide-react';
import { useApp } from '../AppContext';

export default function LogoutModal() {
  const {
    handleConfirmLogout,
    isDarkMode,
    setShowLogoutModal,
    theme
  } = useApp();

  return (
<div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="slide-up" style={{ backgroundColor: theme.cardBg, padding: '32px', borderRadius: '16px', maxWidth: '400px', width: '100%', border: `1px solid ${theme.border}`, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', textAlign: 'center' }}>
            <div style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fff1f2', width: '56px', height: '56px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <LogOut color="#dc2626" size={28} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: theme.textPrimary, fontSize: '20px', fontWeight: '700' }}>¿Cerrar sesión?</h3>
            <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '0 0 24px 0' }}>¿Está seguro que desea salir del sistema de cancelación de hipotecas?</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subtleBg, color: theme.textPrimary, fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLogout}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
              >
                Sí, salir
              </button>
            </div>
          </div>
        </div>
  );
}


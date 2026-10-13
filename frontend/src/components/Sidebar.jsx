import {
  Edit3, FileSpreadsheet, FileText, FolderPlus, History, LogOut, Moon, Sun,
  Users,
} from 'lucide-react';
import { useApp } from '../AppContext';

export default function Sidebar() {
  const {
    activeTab,
    currentUser,
    esAdmin,
    isDarkMode,
    setActiveTab,
    setShowLogoutModal,
    theme,
    toggleTheme
  } = useApp();

  return (
<aside style={{
            width: '280px',
            backgroundColor: theme.cardBg,
            borderRight: `1px solid ${theme.border}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '24px 16px',
            boxSizing: 'border-box',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowY: 'auto'
          }}>
            <div>
              {/* Logo / Título del Sistema */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', paddingLeft: '8px' }}>
                <div style={{ backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
                  <FileText color={theme.accent} size={24} />
                </div>
                <div>
                  <h1 style={{ color: theme.textPrimary, margin: '0 0 2px 0', fontSize: '16px', fontWeight: '700', letterSpacing: '-0.3px' }}>
                    Cancelación de Hipotecas
                  </h1>
                  <p style={{ color: theme.textSecondary, margin: 0, fontSize: '11px', fontWeight: '500' }}>
                    Gestión Notarial
                  </p>
                </div>
              </div>

              {/* NAVEGACIÓN VERTICAL (TABS) */}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={() => setActiveTab('single')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'single' ? theme.accent : 'transparent',
                    color: activeTab === 'single' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <FileText size={18} /> Caso Individual
                </button>

                <button
                  onClick={() => setActiveTab('batch')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'batch' ? theme.accent : 'transparent',
                    color: activeTab === 'batch' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <FolderPlus size={18} /> Carga Masiva (PDFs)
                </button>

                <button
                  onClick={() => setActiveTab('manual')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'manual' ? theme.accent : 'transparent',
                    color: activeTab === 'manual' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <Edit3 size={18} /> Captura Manual
                </button>

                <button
                  onClick={() => setActiveTab('excel')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'excel' ? theme.accent : 'transparent',
                    color: activeTab === 'excel' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <FileSpreadsheet size={18} /> Carga Excel / Lote
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'history' ? theme.accent : 'transparent',
                    color: activeTab === 'history' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <History size={18} /> Mi Historial
                </button>

                {esAdmin && (
                  <>
                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '12px 0' }} />
                    <span style={{ fontSize: '11px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', paddingLeft: '14px', marginBottom: '4px', letterSpacing: '0.5px' }}>Administración</span>
                    
                    <button
                      onClick={() => setActiveTab('users')}
                      className="pulse-hover"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: activeTab === 'users' ? theme.accent : 'transparent',
                        color: activeTab === 'users' ? '#fff' : theme.textSecondary,
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        textAlign: 'left',
                        transition: 'background-color 0.2s ease, color 0.2s ease'
                      }}
                    >
                      <Users size={18} /> Usuarios
                    </button>

                    <button
                      onClick={() => setActiveTab('templates')}
                      className="pulse-hover"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: activeTab === 'templates' ? theme.accent : 'transparent',
                        color: activeTab === 'templates' ? '#fff' : theme.textSecondary,
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        textAlign: 'left',
                        transition: 'background-color 0.2s ease, color 0.2s ease'
                      }}
                    >
                    </button>
                  </>
                )}
              </nav>
            </div>

            {/* Footer de la Barra Lateral (Perfil y Tema) */}
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ backgroundColor: theme.accent, color: '#fff', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px' }}>
                    {currentUser?.username?.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.textPrimary, maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.username}</div>
                    <div style={{ fontSize: '10px', color: theme.textSecondary, textTransform: 'uppercase' }}>{currentUser?.role || (currentUser?.es_admin ? 'admin' : 'operador')}</div>
                  </div>
                </div>
                <button 
                  onClick={toggleTheme} 
                  className="pulse-hover"
                  style={{ background: theme.subtleBg, border: `1px solid ${theme.border}`, color: theme.textPrimary, padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Cambiar Tema"
                >
                  {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>

              <button
                onClick={() => setShowLogoutModal(true)}
                className="pulse-hover"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: isDarkMode ? '#450a0a' : '#fff1f2', color: '#dc2626', border: '1px solid #fecdd3', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
              >
                <LogOut size={16} /> Cerrar Sesión
              </button>
            </div>
          </aside>
  );
}


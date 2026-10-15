import { useLayoutEffect, useRef, useState } from 'react';
import {
  BarChart3, Edit3, FileSpreadsheet, FileText, FolderPlus, History, KeyRound, LogOut, Moon, Sun, Users,
} from 'lucide-react';
import { useApp } from '../AppContext';

export default function Sidebar() {
  const navRef = useRef(null);
  const [indicador, setIndicador] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const {
    setModalPassword,
    activeTab,
    currentUser,
    esAdmin,
    isDarkMode,
    setActiveTab,
    setShowLogoutModal,
    theme,
    toggleTheme
  } = useApp();

  // Mide la pestaña activa para mover el indicador
  useLayoutEffect(() => {
    const medir = () => {
      const nav = navRef.current;
      const activo = nav?.querySelector(`[data-tab="${activeTab}"]`);
      if (!nav || !activo) return setIndicador((i) => ({ ...i, w: 0 }));
      setIndicador({ x: activo.offsetLeft, y: activo.offsetTop, w: activo.offsetWidth, h: activo.offsetHeight });
    };
    medir();
    const obs = new ResizeObserver(medir);
    if (navRef.current) obs.observe(navRef.current);
    window.addEventListener('resize', medir);
    return () => { obs.disconnect(); window.removeEventListener('resize', medir); };
  }, [activeTab]);

  return (
<aside className="barra-lateral" style={{
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
              <nav ref={navRef} className="barra-lateral-nav" style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                {/* Fondo azul que se desliza hasta la pestaña activa */}
                <span
                  aria-hidden="true"
                  className="nav-indicador"
                  style={{
                    backgroundColor: theme.accent,
                    transform: `translate(${indicador.x}px, ${indicador.y}px)`,
                    width: `${indicador.w}px`,
                    height: `${indicador.h}px`,
                    opacity: indicador.w ? 1 : 0,
                  }}
                />
                <button
                  onClick={() => setActiveTab('single')}
                  data-tab="single"
                  aria-current={activeTab === 'single' ? 'page' : undefined}
                  className="nav-item"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: activeTab === 'single' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'color 0.25s ease', position: 'relative', zIndex: 1
                  }}
                >
                  <FileText size={18} /> Caso Individual
                </button>

                <button
                  onClick={() => setActiveTab('batch')}
                  data-tab="batch"
                  aria-current={activeTab === 'batch' ? 'page' : undefined}
                  className="nav-item"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: activeTab === 'batch' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'color 0.25s ease', position: 'relative', zIndex: 1
                  }}
                >
                  <FolderPlus size={18} /> Carga Masiva (PDFs)
                </button>

                <button
                  onClick={() => setActiveTab('manual')}
                  data-tab="manual"
                  aria-current={activeTab === 'manual' ? 'page' : undefined}
                  className="nav-item"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: activeTab === 'manual' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'color 0.25s ease', position: 'relative', zIndex: 1
                  }}
                >
                  <Edit3 size={18} /> Captura Manual
                </button>

                <button
                  onClick={() => setActiveTab('excel')}
                  data-tab="excel"
                  aria-current={activeTab === 'excel' ? 'page' : undefined}
                  className="nav-item"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: activeTab === 'excel' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'color 0.25s ease', position: 'relative', zIndex: 1
                  }}
                >
                  <FileSpreadsheet size={18} /> Carga Excel / Lote
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  data-tab="history"
                  aria-current={activeTab === 'history' ? 'page' : undefined}
                  className="nav-item"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: activeTab === 'history' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'color 0.25s ease', position: 'relative', zIndex: 1
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
                  data-tab="users"
                  aria-current={activeTab === 'users' ? 'page' : undefined}
                  className="nav-item"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: activeTab === 'users' ? '#fff' : theme.textSecondary,
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        textAlign: 'left',
                        transition: 'color 0.25s ease', position: 'relative', zIndex: 1
                      }}
                    >
                      <Users size={18} /> Usuarios
                    </button>
                    <button
                      onClick={() => setActiveTab('kpis')}
                      data-tab="kpis"
                      aria-current={activeTab === 'kpis' ? 'page' : undefined}
                      className="nav-item"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: activeTab === 'kpis' ? '#fff' : theme.textSecondary,
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        textAlign: 'left',
                        transition: 'color 0.25s ease', position: 'relative', zIndex: 1
                      }}
                    >
                      <BarChart3 size={18} /> Rendimiento (KPIs)
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
                onClick={() => setModalPassword({ modo: 'propio' })}
                className="pulse-hover"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: theme.subtleBg, color: theme.textPrimary, border: `1px solid ${theme.border}`, padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', marginBottom: '8px' }}
              >
                <KeyRound size={16} /> Cambiar contraseña
              </button>

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


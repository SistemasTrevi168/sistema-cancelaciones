import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3, ChevronRight, Edit3, FileSpreadsheet, FileText, FolderPlus, History, LayoutGrid, LogOut, Moon, Sun, UserCog, Users, X,
} from 'lucide-react';
import { useApp } from '../AppContext';
import Avatar from './Avatar';

// Navegación del celular:
//  - Arriba: logo y sección actual; a la derecha la foto con el menú de la cuenta (Mi perfil, tema, Cerrar sesión).
//  - Abajo: barra de pestañas con las secciones principales y "Más" para las demás.
const PRINCIPALES = [
  { id: 'single', nombre: 'Individual', icono: FileText },
  { id: 'batch', nombre: 'Masiva', icono: FolderPlus },
  { id: 'manual', nombre: 'Manual', icono: Edit3 },
  { id: 'history', nombre: 'Historial', icono: History },
];
const MAS = [
  { id: 'excel', nombre: 'Carga Excel / Lote', detalle: 'Generar varios expedientes desde un Excel', icono: FileSpreadsheet },
  { id: 'kpis', nombre: 'Reportes por Persona', detalle: 'Rendimiento de cada usuario', icono: BarChart3, admin: true },
  { id: 'users', nombre: 'Usuarios', detalle: 'Altas, contraseñas y permisos', icono: Users, admin: true },
];
const TITULOS_PESTANA = {
  single: 'Caso Individual',
  batch: 'Carga Masiva',
  manual: 'Captura Manual',
  excel: 'Carga Excel / Lote',
  history: 'Mi Historial',
  kpis: 'Reportes por Persona',
  users: 'Usuarios',
  perfil: 'Mi perfil',
};

export default function NavegacionMovil() {
  const { theme, isDarkMode, toggleTheme, activeTab, setActiveTab, currentUser, esAdmin, setShowLogoutModal } = useApp();
  const [cuenta, setCuenta] = useState(false);
  const [mas, setMas] = useState(false);
  const botonCuenta = useRef(null);

  const masVisibles = MAS.filter((m) => !m.admin || esAdmin);
  const enMas = masVisibles.some((m) => m.id === activeTab);

  useEffect(() => {
    if (!cuenta && !mas) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') { setCuenta(false); setMas(false); } };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [cuenta, mas]);

  const ir = (id) => {
    setActiveTab(id);
    setCuenta(false);
    setMas(false);
    window.scrollTo({ top: 0 });
  };
  const nombre = currentUser?.nombre_mostrar || currentUser?.username || '';
  const rol = currentUser?.es_admin || currentUser?.role === 'admin' ? 'Administrador' : 'Operador';
  const superficie = { backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary };

  return (
    <>
      {/* BARRA SUPERIOR */}
      <header className="barra-movil" style={superficie}>
        <span className="barra-movil-logo" style={{ backgroundColor: `${theme.accent}${isDarkMode ? '33' : '14'}`, color: theme.accent }}>
          <FileText size={18} />
        </span>
        <div className="barra-movil-titulo">
          <strong>{TITULOS_PESTANA[activeTab] || 'Cancelación de Hipotecas'}</strong>
          <small style={{ color: theme.textSecondary }}>Cancelación de Hipotecas</small>
        </div>
        <button
          ref={botonCuenta}
          type="button"
          className={`barra-movil-perfil ${cuenta ? 'abierto' : ''}`}
          onClick={() => { setCuenta((v) => !v); setMas(false); }}
          aria-label="Mi cuenta"
          aria-expanded={cuenta}
          style={{ '--anillo': theme.accent }}
        >
          <Avatar usuario={currentUser} tam={36} color={theme.accent} />
        </button>
      </header>

      {createPortal(
        <div className={`nav-movil-raiz ${isDarkMode ? 'tema-oscuro' : 'tema-claro'}`}>
          {/* MENÚ DE LA CUENTA (esquina superior derecha) */}
          {cuenta && (
            <>
              <div className="nav-movil-fondo transparente" onClick={() => setCuenta(false)} aria-hidden="true" />
              <div className="menu-cuenta" role="menu" style={superficie}>
                <div className="menu-cuenta-usuario">
                  <Avatar usuario={currentUser} tam={44} color={theme.accent} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{nombre}</strong>
                    <small style={{ color: theme.textSecondary }}>@{currentUser?.username} · {rol}</small>
                  </div>
                </div>
                <button type="button" role="menuitem" className="menu-cuenta-opcion" onClick={() => ir('perfil')} style={{ color: theme.textPrimary }}>
                  <UserCog size={18} color={theme.accent} /> Mi perfil <ChevronRight size={16} className="flecha" color={theme.textSecondary} />
                </button>
                <button type="button" role="menuitemcheckbox" aria-checked={isDarkMode} className="menu-cuenta-opcion" onClick={toggleTheme} style={{ color: theme.textPrimary }}>
                  {isDarkMode ? <Moon size={18} color={theme.accent} /> : <Sun size={18} color="#d97706" />} Modo oscuro
                  <span className={`mini-interruptor ${isDarkMode ? 'encendido' : ''}`} style={{ '--color': theme.accent }}><i /></span>
                </button>
                <button type="button" role="menuitem" className="menu-cuenta-opcion salir" onClick={() => { setCuenta(false); setShowLogoutModal(true); }}>
                  <LogOut size={18} /> Cerrar sesión
                </button>
              </div>
            </>
          )}

          {/* HOJA "MÁS" */}
          {mas && (
            <>
              <div className="nav-movil-fondo" onClick={() => setMas(false)} aria-hidden="true" />
              <div className="hoja-mas" role="dialog" aria-label="Más secciones" style={superficie}>
                <div className="hoja-mas-asa" style={{ backgroundColor: theme.border }} />
                <div className="hoja-mas-encabezado">
                  <strong>Más secciones</strong>
                  <button type="button" onClick={() => setMas(false)} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={20} /></button>
                </div>
                {masVisibles.map((m) => {
                  const Icono = m.icono;
                  const activa = activeTab === m.id;
                  return (
                    <button key={m.id} type="button" className={`hoja-mas-opcion ${activa ? 'activa' : ''}`} onClick={() => ir(m.id)}
                      style={{ color: theme.textPrimary, backgroundColor: activa ? `${theme.accent}14` : 'transparent', borderColor: activa ? `${theme.accent}55` : theme.border }}>
                      <span className="hoja-mas-icono" style={{ backgroundColor: `${theme.accent}${isDarkMode ? '2e' : '14'}`, color: theme.accent }}><Icono size={20} /></span>
                      <span className="hoja-mas-texto">
                        <strong>{m.nombre}</strong>
                        <small style={{ color: theme.textSecondary }}>{m.detalle}</small>
                      </span>
                      <ChevronRight size={18} color={theme.textSecondary} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* BARRA DE PESTAÑAS (abajo) */}
          <nav className="pestanas-movil" aria-label="Secciones" style={superficie}>
            {PRINCIPALES.map((p) => {
              const Icono = p.icono;
              const activa = activeTab === p.id;
              return (
                <button key={p.id} type="button" onClick={() => ir(p.id)} aria-current={activa ? 'page' : undefined}
                  className={activa ? 'activa' : ''} style={{ color: activa ? theme.accent : theme.textSecondary }}>
                  <span className="pestana-icono" style={activa ? { backgroundColor: `${theme.accent}1f` } : undefined}><Icono size={21} /></span>
                  <span>{p.nombre}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => { setMas((v) => !v); setCuenta(false); }} aria-expanded={mas}
              className={enMas || mas ? 'activa' : ''} style={{ color: enMas || mas ? theme.accent : theme.textSecondary }}>
              <span className="pestana-icono" style={enMas || mas ? { backgroundColor: `${theme.accent}1f` } : undefined}><LayoutGrid size={21} /></span>
              <span>Más</span>
            </button>
          </nav>
        </div>,
        document.body,
      )}
    </>
  );
}

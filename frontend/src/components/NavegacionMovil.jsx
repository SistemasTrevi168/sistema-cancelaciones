import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, ChevronRight, Edit3, FileSpreadsheet, FileText, FolderPlus, History, Inbox, LayoutDashboard, LayoutGrid, LogOut, Moon, Share2, Sun, UserCog, Users, X } from 'lucide-react';
import { useApp } from '../AppContext';
import Avatar from './Avatar';
import CampanaNotificaciones from './CampanaNotificaciones';
import usePresencia from '../ui/usarPresencia';

// Navegación del celular:
//  - Arriba: logo y sección actual; a la derecha la foto con el menú de la cuenta (Mi perfil, tema, Cerrar sesión).
//  - Abajo: barra de pestañas con las secciones principales y "Más" para las demás.
const PRINCIPALES = [
  { id: 'single', nombre: 'Individual', icono: FileText },
  { id: 'batch', nombre: 'Masiva', icono: FolderPlus },
  { id: 'manual', nombre: 'Manual', icono: Edit3 },
  { id: 'history', nombre: 'Historial', icono: History },
];
// Usuario de revisión: solo ve los expedientes que le comparten
const PRINCIPALES_REVISOR = [
  { id: 'compartidos', nombre: 'Compartidos', icono: Inbox },
];
const MAS = [
  { id: 'compartidos', nombre: 'Compartidos conmigo', detalle: 'Expedientes que otras personas te compartieron', icono: Inbox, compartidos: true },
  { id: 'excel', nombre: 'Carga Excel / Lote', detalle: 'Generar varios expedientes desde un Excel', icono: FileSpreadsheet },
  { id: 'panel', nombre: 'Panel de inicio', detalle: 'Cómo va el trabajo del equipo hoy', icono: LayoutDashboard, admin: true, funcion: 'panel_admin' },
  { id: 'kpis', nombre: 'Reportes por Persona', detalle: 'Rendimiento de cada usuario', icono: BarChart3, admin: true },
  { id: 'registro', nombre: 'Expedientes compartidos', detalle: 'Qué se compartió, con quién y cuándo', icono: Share2, admin: true, funcion: 'registro_compartidos' },
  { id: 'users', nombre: 'Usuarios', detalle: 'Altas, contraseñas y permisos', icono: Users, admin: true },
];
const TITULOS_PESTANA = {
  single: 'Caso Individual',
  batch: 'Carga Masiva',
  manual: 'Captura Manual',
  excel: 'Carga Excel / Lote',
  history: 'Mi Historial',
  compartidos: 'Compartidos conmigo',
  kpis: 'Reportes por Persona',
  panel: 'Panel de inicio',
  registro: 'Expedientes compartidos',
  users: 'Usuarios',
  perfil: 'Mi perfil',
};

export default function NavegacionMovil() {
  const { theme, isDarkMode, toggleTheme, activeTab, setActiveTab, currentUser, esAdmin, esRevisor, verCompartidos, setShowLogoutModal, puedeServidor } = useApp();
  const [cuenta, setCuenta] = useState(false);
  const [mas, setMas] = useState(false);
  const botonCuenta = useRef(null);
  // Arrastre de la hoja "Más" (se baja con el dedo desde la barrita o el título)
  const [arrastre, setArrastre] = useState(0);
  const [cerrandoMas, setCerrandoMas] = useState(false);
  const toque = useRef(null);
  const menuCuenta = usePresencia(cuenta, 150);

  const cerrarMas = () => {
    if (!mas || cerrandoMas) return;
    setCerrandoMas(true);
    setTimeout(() => { setMas(false); setCerrandoMas(false); setArrastre(0); }, 220);
  };
  const alEmpezarArrastre = (e) => {
    if (e.target.closest('button:not(.hoja-mas-asa)')) return;
    toque.current = { y: e.clientY, t: Date.now(), movio: false, enAsa: !!e.target.closest('.hoja-mas-asa') };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const alArrastrar = (e) => {
    if (!toque.current) return;
    const dy = Math.max(0, e.clientY - toque.current.y);
    if (dy > 4) toque.current.movio = true;
    setArrastre(dy);
  };
  const alSoltarArrastre = (e) => {
    if (!toque.current) return;
    const dy = Math.max(0, e.clientY - toque.current.y);
    const rapido = dy / Math.max(1, Date.now() - toque.current.t) > 0.5;
    const toco = !toque.current.movio && toque.current.enAsa;
    toque.current = null;
    if (dy > 70 || (rapido && dy > 20) || toco) cerrarMas();
    else setArrastre(0);
  };

  const masVisibles = esRevisor ? [] : MAS.filter((m) => (!m.admin || esAdmin) && (!m.compartidos || verCompartidos) && (!m.funcion || puedeServidor?.(m.funcion)));
  const principales = esRevisor ? PRINCIPALES_REVISOR : PRINCIPALES;
  const enMas = masVisibles.some((m) => m.id === activeTab);

  useEffect(() => {
    if (!cuenta && !mas) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') { setCuenta(false); cerrarMas(); } };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta, mas]);

  const ir = (id) => {
    setActiveTab(id);
    setCuenta(false);
    setMas(false);
    setArrastre(0);
    window.scrollTo({ top: 0 });
  };
  const nombre = currentUser?.nombre_mostrar || currentUser?.username || '';
  const rol = currentUser?.es_admin || currentUser?.role === 'admin' ? 'Administrador' : (currentUser?.role === 'revisor' ? 'Revisor' : 'Operador');
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
        {puedeServidor?.('notificaciones') && <CampanaNotificaciones className="campana-movil" tam={19} />}
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
          {menuCuenta.montado && (
            <>
              <div className={`nav-movil-fondo transparente ${menuCuenta.saliendo ? 'cerrando' : ''}`} onClick={() => setCuenta(false)} aria-hidden="true" />
              <div className={`menu-cuenta ${menuCuenta.saliendo ? 'saliendo' : ''}`} role="menu" style={superficie}>
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
              <div className={`nav-movil-fondo ${cerrandoMas ? 'cerrando' : ''}`} onClick={cerrarMas} aria-hidden="true"
                style={arrastre ? { opacity: Math.max(0.2, 1 - arrastre / 300) } : undefined} />
              <div className={`hoja-mas ${cerrandoMas ? 'cerrando' : ''} ${arrastre ? 'arrastrando' : ''}`} role="dialog" aria-label="Más secciones"
                style={{ ...superficie, ...(arrastre && !cerrandoMas ? { transform: `translateY(${arrastre}px)` } : {}) }}>
                <div className="hoja-mas-arrastre" onPointerDown={alEmpezarArrastre} onPointerMove={alArrastrar}
                  onPointerUp={alSoltarArrastre} onPointerCancel={alSoltarArrastre}>
                  <button type="button" className="hoja-mas-asa" aria-label="Desliza hacia abajo para cerrar" data-sin-onda>
                    <i style={{ backgroundColor: isDarkMode ? '#475569' : '#cbd5e1' }} />
                  </button>
                  <div className="hoja-mas-encabezado">
                    <strong>Más secciones</strong>
                    <button type="button" onClick={cerrarMas} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={20} /></button>
                  </div>
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
            {principales.map((p) => {
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
            {masVisibles.length > 0 && <button type="button" onClick={() => { if (mas) cerrarMas(); else { setArrastre(0); setMas(true); } setCuenta(false); }} aria-expanded={mas}
              className={enMas || mas ? 'activa' : ''} style={{ color: enMas || mas ? theme.accent : theme.textSecondary }}>
              <span className="pestana-icono" style={enMas || mas ? { backgroundColor: `${theme.accent}1f` } : undefined}><LayoutGrid size={21} /></span>
              <span>Más</span>
            </button>}
          </nav>
        </div>,
        document.body,
      )}
    </>
  );
}

import { ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, FileText, IdCard, Inbox, KeyRound, LifeBuoy, Loader2, PackageCheck, Plus, Power, Search, Share2, ShieldCheck, Trash2, UserCog, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { avisar } from '../ui/notificaciones';
import Selector from './Selector';

// Tipos de usuario: el operador hace expedientes y los comparte; el revisor solo revisa los que le comparten
const TIPOS_USUARIO = [
  { id: 'operador', nombre: 'Operador', detalle: 'Hace expedientes, los comparte y revisa los que le comparten', icono: UserCog },
  { id: 'revisor', nombre: 'Revisor', detalle: 'Solo revisa, edita y descarga los que le comparten', icono: Eye },
  { id: 'admin', nombre: 'Administrador', detalle: 'Todo, más usuarios, reportes y respaldos', icono: ShieldCheck },
];
import { useApp } from '../AppContext';
import Avatar from './Avatar';
import PanelRespaldos from './PanelRespaldos';
import PanelPdfs from './PanelPdfs';
import PerfilUsuario from './PerfilUsuario';

export default function TabUsuarios() {
  const {
    creandoUsuario,
    currentUser,
    handleCambiarActivo,
    setModalPassword,
    puedeServidor,
    handleCrearUsuario,
    handleEliminarUsuario,
    handleCambiarRol,
    loadingUsuarios,
    nuevoUsuario,
    setNuevoUsuario,
    theme,
    usuariosLista,
    cargarUsuarios,
  } = useApp();
  const [verPassword, setVerPassword] = useState(false);
  // Buscador de la lista: por nombre o usuario, sin importar acentos ni mayúsculas
  const [busca, setBusca] = useState('');
  const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Filtros y orden de la lista
  const [tipo, setTipo] = useState('todos'); // todos | operador | admin | revisor
  const [estadoFiltro, setEstadoFiltro] = useState('todos'); // todos | activos | inactivos
  const [orden, setOrden] = useState('az'); // az | za | expedientes | reciente
  const esAdminU = (u) => u.es_admin || u.role === 'admin' || u.username === 'admin';
  const tipoDe = (u) => (esAdminU(u) ? 'admin' : (u.rol === 'revisor' ? 'revisor' : 'operador'));
  const nombreDe = (u) => (u.nombre_mostrar || u.username || '').trim();
  const hayRevisores = usuariosLista.some((u) => tipoDe(u) === 'revisor');
  const cuantos = (t) => usuariosLista.filter((u) => t === 'todos' || tipoDe(u) === t).length;
  const visibles = usuariosLista
    .filter((u) => !busca.trim() || normal(`${u.nombre_mostrar || ''} ${u.username}`).includes(normal(busca.trim())))
    .filter((u) => tipo === 'todos' || tipoDe(u) === tipo)
    .filter((u) => estadoFiltro === 'todos' || (estadoFiltro === 'activos') === (u.activo !== false))
    .sort((a, b) => {
      if (orden === 'expedientes') return (b.expedientes || 0) - (a.expedientes || 0) || nombreDe(a).localeCompare(nombreDe(b), 'es', { sensitivity: 'base' });
      if (orden === 'reciente') return String(b.ultimo_expediente || '').localeCompare(String(a.ultimo_expediente || '')) || nombreDe(a).localeCompare(nombreDe(b), 'es', { sensitivity: 'base' });
      const r = nombreDe(a).localeCompare(nombreDe(b), 'es', { sensitivity: 'base' });
      return orden === 'za' ? -r : r;
    });
  const filtrando = busca.trim() || tipo !== 'todos' || estadoFiltro !== 'todos';
  // Paginación: 5 usuarios por página
  const POR_PAGINA = 5;
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const enPagina = visibles.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  // Perfil de un usuario abierto (como lo ve él en "Mi perfil")
  const [perfilDe, setPerfilDe] = useState(null);

  // Mujer u hombre del usuario nuevo: se deduce del nombre (igual que el saludo) y se puede cambiar
  const conGenero = puedeServidor('genero_usuario');
  const nombreNuevo = (nuevoUsuario.nombre_mostrar || nuevoUsuario.username || '').trim();
  const [deducido, setDeducido] = useState({ nombre: '', genero: '' });
  useEffect(() => {
    if (!conGenero || !nombreNuevo) return undefined;
    let vivo = true;
    const t = setTimeout(() => {
      api.post('/admin/genero-de-nombre', { nombre: nombreNuevo })
        .then((r) => { if (vivo) setDeducido({ nombre: nombreNuevo, genero: r.data?.genero || '' }); })
        .catch(() => {});
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [nombreNuevo, conGenero]);
  const generoNuevo = nuevoUsuario.genero || (deducido.nombre === nombreNuevo ? deducido.genero : '');
  const elegirGenero = (g) => setNuevoUsuario({ ...nuevoUsuario, genero: g });

  // Cambiar mujer / hombre de un usuario que ya existe
  const [cambiandoGenero, setCambiandoGenero] = useState(null);
  const cambiarGenero = async (u) => {
    const nuevo = u.genero === 'FEMENINO' ? 'MASCULINO' : 'FEMENINO';
    setCambiandoGenero(u.id);
    try {
      await api.put(`/admin/usuarios/${u.id}/genero`, { genero: nuevo });
      avisar.exito(`${u.nombre_mostrar || u.username}: ahora se le saluda como ${nuevo === 'FEMENINO' ? '«Bienvenida» (mujer)' : '«Bienvenido» (hombre)'}.`);
      cargarUsuarios?.();
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo cambiar.');
    } finally {
      setCambiandoGenero(null);
    }
  };
  if (perfilDe) return <PerfilUsuario usuario={perfilDe} onVolver={() => setPerfilDe(null)} />;

  return (
<>
<div className="grid-usuarios" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 300px) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
              {/* Formulario Crear Usuario: mide lo que su contenido y se queda a la vista al bajar por la lista */}
              <div className="usuarios-alta" style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={20} color={theme.accent} /> Crear Nuevo Usuario
                </h2>
                <form onSubmit={handleCrearUsuario}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Nombre de Usuario</label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      name="nuevo-usuario"
                      value={nuevoUsuario.username}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, username: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Nombre completo <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                    <input
                      type="text"
                      autoComplete="off"
                      name="nuevo-usuario-nombre"
                      placeholder="Ej. Meredith López García"
                      value={nuevoUsuario.nombre_mostrar || ''}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre_mostrar: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                    {conGenero && nombreNuevo && (
                      <div className="alta-genero" style={{ color: theme.textSecondary }}>
                        <span>
                          {generoNuevo ? <>Este usuario es <strong style={{ color: theme.textPrimary }}>{generoNuevo === 'FEMENINO' ? 'mujer' : 'hombre'}</strong> · se le saludará «{generoNuevo === 'FEMENINO' ? 'Bienvenida' : 'Bienvenido'}»</> : 'Elige si es mujer u hombre:'}
                        </span>
                        <span className="alta-genero-opciones" role="radiogroup" aria-label="Mujer u hombre">
                          {[['FEMENINO', 'Mujer'], ['MASCULINO', 'Hombre']].map(([g, txt]) => (
                            <button key={g} type="button" role="radio" aria-checked={generoNuevo === g} onClick={() => elegirGenero(g)}
                              className={generoNuevo === g ? 'activo' : ''}
                              style={generoNuevo === g ? { backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent } : { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.inputBg }}>
                              {txt}
                            </button>
                          ))}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Contraseña</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={verPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        name="nuevo-usuario-password"
                        value={nuevoUsuario.password}
                        onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
                        style={{ width: '100%', padding: '10px 40px 10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                      />
                      <button type="button" onClick={() => setVerPassword((v) => !v)} aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        data-sin-onda style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', padding: '6px', cursor: 'pointer', color: theme.textSecondary, display: 'flex' }}>
                        {verPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Tipo de usuario</span>
                    <div className="tipos-usuario" role="radiogroup" aria-label="Tipo de usuario">
                      {TIPOS_USUARIO.filter((tu) => tu.id !== 'revisor').map((tu) => {
                        const activo = (nuevoUsuario.role || 'operador') === tu.id;
                        const Icono = tu.icono;
                        return (
                          <button key={tu.id} type="button" role="radio" aria-checked={activo} className={`tipo-usuario ${activo ? 'activo' : ''}`}
                            onClick={() => setNuevoUsuario({ ...nuevoUsuario, role: tu.id, es_admin: tu.id === 'admin' })}
                            style={{ borderColor: activo ? theme.accent : theme.border, backgroundColor: activo ? `${theme.accent}12` : theme.inputBg, color: theme.textPrimary }}>
                            <Icono size={16} color={activo ? theme.accent : theme.textSecondary} />
                            <span><strong>{tu.nombre}</strong><small style={{ color: theme.textSecondary }}>{tu.detalle}</small></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={creandoUsuario}
                    style={{ width: '100%', backgroundColor: theme.accent, color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                  >
                    {creandoUsuario ? 'Guardando...' : 'Guardar Usuario'}
                  </button>
                </form>
              </div>

              {/* Lista de Usuarios */}
              <div className="usuarios-lista-tarjeta" style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                <div className="usuarios-encabezado">
                  <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={20} color={theme.accent} /> Lista de Usuarios
                    <span className="usuarios-conteo" style={{ color: theme.textSecondary, borderColor: theme.border }}>{filtrando ? `${visibles.length} de ${usuariosLista.length}` : usuariosLista.length}</span>
                  </h2>
                  <label className="usuarios-buscar" style={{ borderColor: theme.border, backgroundColor: theme.inputBg }}>
                    <Search size={15} color={theme.textSecondary} />
                    <input type="search" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar por nombre o usuario…"
                      aria-label="Buscar usuarios" style={{ color: theme.textPrimary }} />
                    {busca && <button type="button" className="quitar-archivo" onClick={() => setBusca('')} aria-label="Limpiar búsqueda"><X size={13} /></button>}
                  </label>
                </div>
                <div className="usuarios-filtros">
                  <div className="hf-segmentos usuarios-tipos" role="group" aria-label="Tipo de usuario" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg }}>
                    {[['todos', 'Todos'], ['operador', 'Operadores'], ...(hayRevisores ? [['revisor', 'Revisores']] : []), ['admin', 'Administradores']].map(([id, txt]) => (
                      <button key={id} type="button" className={`hf-segmento ${tipo === id ? 'activo' : ''}`} onClick={() => { setTipo(id); setPagina(1); }} aria-pressed={tipo === id}
                        style={tipo === id ? { backgroundColor: theme.accent, color: '#fff' } : { color: theme.textSecondary }}>
                        {txt} <span className="usuarios-tipo-n">{cuantos(id)}</span>
                      </button>
                    ))}
                  </div>
                  <Selector value={estadoFiltro} onChange={(e) => { setEstadoFiltro(e.target.value); setPagina(1); }} aria-label="Estado"
                    style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '12px', padding: '6px 8px', cursor: 'pointer' }}>
                    <option value="todos">Activos e inactivos</option>
                    <option value="activos">Solo activos</option>
                    <option value="inactivos">Solo inactivos</option>
                  </Selector>
                  <label className="usuarios-orden" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textSecondary }}>
                    <ArrowUpDown size={13} />
                    <Selector value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar"
                      style={{ border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '12px', fontWeight: 600, padding: '6px 0', cursor: 'pointer' }}>
                      <option value="az">Nombre A-Z</option>
                      <option value="za">Nombre Z-A</option>
                      <option value="expedientes">Más expedientes</option>
                      <option value="reciente">Último expediente</option>
                    </Selector>
                  </label>
                  {filtrando && (
                    <button type="button" className="enlace-pequeno" onClick={() => { setBusca(''); setTipo('todos'); setEstadoFiltro('todos'); }} style={{ color: theme.accent }}>Limpiar filtros</button>
                  )}
                </div>

                {loadingUsuarios ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : (
                  <div className="usuarios-lista-scroll" style={{ borderColor: theme.border }}>
                  <table className="tabla-tarjetas tabla-usuarios" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary, backgroundColor: theme.cardBg }}>
                        <th style={{ padding: '10px', backgroundColor: theme.cardBg }}>Usuario</th>
                        <th className="col-acciones" style={{ padding: '10px', textAlign: 'right', backgroundColor: theme.cardBg }}>Tipo y acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.length === 0 && (
                        <tr><td colSpan={2} style={{ padding: '24px', textAlign: 'center', color: theme.textSecondary }}>{busca.trim() ? `Ningún usuario coincide con «${busca}».` : 'Ningún usuario con estos filtros.'}</td></tr>
                      )}
                      {enPagina.map((u, i) => {
                        const esUsuarioAdmin = u.es_admin || u.role === 'admin' || u.username === 'admin';
                        const esYo = u.username === currentUser?.username;
                        const activo = u.activo !== false;
                        const btnIcono = {};
                        return (
                          <tr key={u.id} className="fila-usuario" style={{ borderBottom: `1px solid ${theme.border}`, opacity: activo ? 1 : 0.6, animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                            <td className="celda-titulo" style={{ padding: '10px', fontWeight: '600', color: theme.textPrimary, minWidth: 0 }}>
                              <span style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <button type="button" className="usuario-abrir-perfil" onClick={() => setPerfilDe(u)} title={`Ver el perfil de ${u.nombre_mostrar || u.username}`} aria-label={`Ver el perfil de ${u.nombre_mostrar || u.username}`} data-sin-onda>
                                <Avatar usuario={esYo ? { ...u, foto: currentUser?.foto ?? u.foto, nombre_mostrar: currentUser?.nombre_mostrar ?? u.nombre_mostrar } : u} tam={30} color={theme.accent} />
                                </button>
                                <span>
                                  <button type="button" className="usuario-nombre-perfil" onClick={() => setPerfilDe(u)} data-sin-onda style={{ color: theme.textPrimary }}>
                                  {u.nombre_mostrar || u.username}</button>{esYo && <span style={{ fontWeight: 'normal', color: theme.textSecondary }}> (tú)</span>}
                                  {u.nombre_mostrar && (
                                    <span className="usuario-meta" style={{ display: 'block', fontWeight: 'normal', fontSize: '11px', color: theme.textSecondary }}>@{u.username}</span>
                                  )}
                                  {typeof u.expedientes === 'number' && (
                                    <span className="usuario-cifras">
                                      <span className="usuario-cifra" title={`${u.generados ?? 0} generados · ${u.revisados ?? 0} revisados · ${u.entregados ?? 0} entregados`}
                                        style={{ color: theme.textPrimary, backgroundColor: theme.subtleBg, borderColor: theme.border }}>
                                        <FileText size={11} /> {u.expedientes} expediente{u.expedientes === 1 ? '' : 's'}
                                      </span>
                                      {typeof u.revisados === 'number' && (
                                        <span className={`usuario-cifra ${u.revisados ? 'cifra-revisados' : 'cifra-cero'}`} title="Expedientes marcados como Revisado">
                                          <CheckCircle2 size={11} /> {u.revisados} revisado{u.revisados === 1 ? '' : 's'}
                                        </span>
                                      )}
                                      {u.entregados > 0 && (
                                        <span className="usuario-cifra cifra-entregados" title="Expedientes marcados como Entregado"><PackageCheck size={11} /> {u.entregados} entregado{u.entregados === 1 ? '' : 's'}</span>
                                      )}
                                      {typeof u.compartidos === 'number' && (
                                        <span className={`usuario-cifra ${u.compartidos || u.compartio_todos ? 'cifra-compartidos' : 'cifra-cero'}`} title="Expedientes suyos que compartió con alguien">
                                          <Share2 size={11} /> {u.compartio_todos ? 'Compartió todos' : `${u.compartidos} compartido${u.compartidos === 1 ? '' : 's'}`}
                                        </span>
                                      )}
                                      {(u.le_comparten > 0 || u.le_comparten_todos) && (
                                        <span className="usuario-cifra cifra-recibidos" title="Expedientes de otras personas que puede ver">
                                          <Inbox size={11} /> {u.le_comparten_todos ? 'Le comparten todos los de alguien' : `Le comparten ${u.le_comparten}`}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  <span className="usuario-estado">
                              <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '999px', backgroundColor: activo ? '#dcfce7' : '#f1f5f9', color: activo ? '#166534' : '#475569' }}>
                                {activo ? 'Activo' : 'Inactivo'}
                              </span>
                              {conGenero && (u.genero === 'FEMENINO' || u.genero === 'MASCULINO') && (
                                <button type="button" className="usuario-genero" onClick={() => cambiarGenero(u)} disabled={cambiandoGenero === u.id} data-sin-onda
                                  title={`Se le saluda «${u.genero === 'FEMENINO' ? 'Bienvenida' : 'Bienvenido'}»${u.genero_fijo ? '' : ' (se dedujo de su nombre)'}. Clic para cambiar a ${u.genero === 'FEMENINO' ? 'hombre' : 'mujer'}.`}
                                  style={{ borderColor: theme.border, color: theme.textSecondary }}>
                                  {cambiandoGenero === u.id ? <Loader2 size={10} className="girando" /> : null}{u.genero === 'FEMENINO' ? 'Mujer' : 'Hombre'} · cambiar
                                </button>
                              )}
                              {u.debe_cambiar_password && (
                                <span title="Se le restableció la contraseña: al entrar deberá cambiarla" style={{ display: 'inline-block', marginLeft: '6px', fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', backgroundColor: '#ecfeff', color: '#0e7490', whiteSpace: 'nowrap' }}>
                                  Contraseña temporal
                                </span>
                              )}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="celda-acciones celda-rol-acciones" data-etiqueta="Tipo y acciones" style={{ padding: '10px 6px', textAlign: 'right', color: theme.textSecondary }}>
                              <div className="usuario-rol">
                              {esYo || u.username === 'admin' ? (esUsuarioAdmin ? 'Administrador' : (u.rol === 'revisor' ? 'Revisor' : 'Operador')) : (
                                <Selector value={u.rol || (esUsuarioAdmin ? 'admin' : 'operador')} onChange={(e) => handleCambiarRol(u, e.target.value)}
                                  className="selector-rol" aria-label={`Tipo de usuario de ${u.username}`}
                                  style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '12px', padding: '5px 8px', cursor: 'pointer' }}>
                                  {TIPOS_USUARIO.filter((tu) => tu.id !== 'revisor' || u.rol === 'revisor').map((tu) => <option key={tu.id} value={tu.id}>{tu.nombre}</option>)}
                                </Selector>
                              )}
                                                          </div>
                              <div className="usuario-botones">
                              <button type="button" className="accion-usuario accion-perfil" onClick={() => setPerfilDe(u)} style={{ color: theme.textSecondary }} title="Ver perfil">
                                <IdCard size={16} />
                              </button>
                              {!esYo && (
                                <button type="button" className="accion-usuario accion-llave" onClick={() => setModalPassword({ modo: 'reset', usuario: u })} style={{ ...btnIcono, color: theme.accent }} title="Cambiar contraseña (con la contraseña actual del usuario)">
                                  <KeyRound size={16} />
                                </button>
                              )}
                              {!esYo && puedeServidor('restablecer_password') && (
                                <button type="button" className="accion-usuario accion-salvavidas" onClick={() => setModalPassword({ modo: 'restablecer', usuario: u })} style={{ ...btnIcono, color: '#0891b2' }} title="Restablecer contraseña (la olvidó)">
                                  <LifeBuoy size={16} />
                                </button>
                              )}
                              {!esUsuarioAdmin && !esYo && (
                                <button type="button" className="accion-usuario accion-encender" onClick={() => handleCambiarActivo(u)} style={{ ...btnIcono, color: activo ? '#d97706' : '#16a34a' }} title={activo ? 'Desactivar usuario' : 'Activar usuario'}>
                                  <Power size={16} />
                                </button>
                              )}
                              {!esUsuarioAdmin ? (
                                <button
                                  type="button"
                                  className="accion-usuario accion-borrar"
                                  onClick={(e) => handleEliminarUsuario(e, u.id)}
                                  style={{ ...btnIcono, color: '#ef4444' }}
                                  title="Eliminar usuario"
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : (
                                esYo && <span style={{ fontSize: '11px', color: theme.textSecondary, fontStyle: 'italic' }}>Protegido</span>
                              )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}
                {!loadingUsuarios && visibles.length > POR_PAGINA && (
                  <nav className="paginacion-lote usuarios-paginas" aria-label="Páginas de usuarios" style={{ borderColor: theme.border, color: theme.textSecondary }}>
                    <span>{(paginaVista - 1) * POR_PAGINA + 1}–{Math.min(paginaVista * POR_PAGINA, visibles.length)} de {visibles.length} usuarios</span>
                    <div className="paginacion-botones">
                      <button type="button" onClick={() => setPagina(paginaVista - 1)} disabled={paginaVista === 1} aria-label="Página anterior" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronLeft size={15} /></button>
                      {Array.from({ length: totalPaginas }, (_, k) => k + 1).map((n) => (
                        <button key={n} type="button" onClick={() => setPagina(n)} aria-current={n === paginaVista ? 'page' : undefined}
                          style={{ borderColor: n === paginaVista ? theme.accent : theme.border, backgroundColor: n === paginaVista ? theme.accent : theme.cardBg, color: n === paginaVista ? '#fff' : theme.textPrimary }}>{n}</button>
                      ))}
                      <button type="button" onClick={() => setPagina(paginaVista + 1)} disabled={paginaVista === totalPaginas} aria-label="Página siguiente" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronRight size={15} /></button>
                    </div>
                  </nav>
                )}
              </div>
            </div>
<PanelRespaldos />
<PanelPdfs />
</>
  );
}

import { Eye, EyeOff, KeyRound, LifeBuoy, Loader2, Plus, Power, Search, ShieldCheck, Trash2, UserCog, Users, X } from 'lucide-react';
import { useState } from 'react';
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
    usuariosLista
  } = useApp();
  const [verPassword, setVerPassword] = useState(false);
  // Buscador de la lista: por nombre o usuario, sin importar acentos ni mayúsculas
  const [busca, setBusca] = useState('');
  const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const visibles = usuariosLista.filter((u) => !busca.trim() || normal(`${u.nombre_mostrar || ''} ${u.username}`).includes(normal(busca.trim())));

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
                      value={nuevoUsuario.username}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, username: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Contraseña</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={verPassword ? 'text' : 'password'}
                        required
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
              <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                <div className="usuarios-encabezado">
                  <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={20} color={theme.accent} /> Lista de Usuarios
                    <span className="usuarios-conteo" style={{ color: theme.textSecondary, borderColor: theme.border }}>{busca.trim() ? `${visibles.length} de ${usuariosLista.length}` : usuariosLista.length}</span>
                  </h2>
                  <label className="usuarios-buscar" style={{ borderColor: theme.border, backgroundColor: theme.inputBg }}>
                    <Search size={15} color={theme.textSecondary} />
                    <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o usuario…"
                      aria-label="Buscar usuarios" style={{ color: theme.textPrimary }} />
                    {busca && <button type="button" className="quitar-archivo" onClick={() => setBusca('')} aria-label="Limpiar búsqueda"><X size={13} /></button>}
                  </label>
                </div>

                {loadingUsuarios ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                  <table className="tabla-tarjetas" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '10px' }}>Usuario</th>
                        <th style={{ padding: '10px' }}>Rol</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.length === 0 && (
                        <tr><td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: theme.textSecondary }}>Ningún usuario coincide con «{busca}».</td></tr>
                      )}
                      {visibles.map((u, i) => {
                        const esUsuarioAdmin = u.es_admin || u.role === 'admin' || u.username === 'admin';
                        const esYo = u.username === currentUser?.username;
                        const activo = u.activo !== false;
                        const btnIcono = {};
                        return (
                          <tr key={u.id} className="fila-usuario" style={{ borderBottom: `1px solid ${theme.border}`, opacity: activo ? 1 : 0.6, animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                            <td className="celda-titulo" style={{ padding: '10px', fontWeight: '600', color: theme.textPrimary, minWidth: '180px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Avatar usuario={esYo ? { ...u, foto: currentUser?.foto ?? u.foto, nombre_mostrar: currentUser?.nombre_mostrar ?? u.nombre_mostrar } : u} tam={30} color={theme.accent} />
                                <span>
                                  {u.nombre_mostrar || u.username}{esYo && <span style={{ fontWeight: 'normal', color: theme.textSecondary }}> (tú)</span>}
                                  <span style={{ display: 'block', fontWeight: 'normal', fontSize: '11px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                                    {u.nombre_mostrar ? `@${u.username}` : ''}{u.nombre_mostrar && typeof u.expedientes === 'number' ? ' · ' : ''}{typeof u.expedientes === 'number' ? `${u.expedientes} expediente${u.expedientes === 1 ? '' : 's'}` : ''}
                                  </span>
                                  <span className="usuario-estado">
                              <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '999px', backgroundColor: activo ? '#dcfce7' : '#f1f5f9', color: activo ? '#166534' : '#475569' }}>
                                {activo ? 'Activo' : 'Inactivo'}
                              </span>
                              {u.debe_cambiar_password && (
                                <span title="Se le restableció la contraseña: al entrar deberá cambiarla" style={{ display: 'inline-block', marginLeft: '6px', fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', backgroundColor: '#ecfeff', color: '#0e7490', whiteSpace: 'nowrap' }}>
                                  Contraseña temporal
                                </span>
                              )}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td data-etiqueta="Rol" style={{ padding: '10px', color: theme.textSecondary }}>
                              {esYo || u.username === 'admin' ? (esUsuarioAdmin ? 'Administrador' : (u.rol === 'revisor' ? 'Revisor' : 'Operador')) : (
                                <Selector value={u.rol || (esUsuarioAdmin ? 'admin' : 'operador')} onChange={(e) => handleCambiarRol(u, e.target.value)}
                                  className="selector-rol" aria-label={`Tipo de usuario de ${u.username}`}
                                  style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '12px', padding: '5px 8px', cursor: 'pointer' }}>
                                  {TIPOS_USUARIO.filter((tu) => tu.id !== 'revisor' || u.rol === 'revisor').map((tu) => <option key={tu.id} value={tu.id}>{tu.nombre}</option>)}
                                </Selector>
                              )}
                            </td>
                            <td className="celda-acciones" style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
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
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </div>
<PanelRespaldos />
</>
  );
}

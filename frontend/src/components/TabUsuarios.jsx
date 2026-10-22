import { KeyRound, Loader2, Plus, Power, ShieldCheck, ShieldOff, Trash2, Users } from 'lucide-react';
import { useApp } from '../AppContext';
import Avatar from './Avatar';
import PanelRespaldos from './PanelRespaldos';

export default function TabUsuarios() {
  const {
    creandoUsuario,
    currentUser,
    handleCambiarActivo,
    setModalPassword,
    handleCrearUsuario,
    handleEliminarUsuario,
    handleCambiarRol,
    loadingUsuarios,
    nuevoUsuario,
    setNuevoUsuario,
    theme,
    usuariosLista
  } = useApp();

  return (
<>
<div className="grid-usuarios" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              {/* Formulario Crear Usuario */}
              <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
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
                    <input
                      type="password"
                      required
                      value={nuevoUsuario.password}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="es_admin_cb"
                      checked={nuevoUsuario.es_admin}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, es_admin: e.target.checked, role: e.target.checked ? 'admin' : 'operador' })}
                    />
                    <label htmlFor="es_admin_cb" style={{ fontSize: '13px', color: theme.textPrimary, cursor: 'pointer' }}>Es Administrador</label>
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
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={20} color={theme.accent} /> Lista de Usuarios
                </h2>

                {loadingUsuarios ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                  <table className="tabla-tarjetas" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '10px' }}>Usuario</th>
                        <th style={{ padding: '10px' }}>Rol</th>
                        <th style={{ padding: '10px' }}>Estado</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosLista.map((u) => {
                        const esUsuarioAdmin = u.es_admin || u.role === 'admin' || u.username === 'admin';
                        const esYo = u.username === currentUser?.username;
                        const activo = u.activo !== false;
                        const btnIcono = { backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '6px' };
                        return (
                          <tr key={u.id} style={{ borderBottom: `1px solid ${theme.border}`, opacity: activo ? 1 : 0.6 }}>
                            <td className="celda-titulo" style={{ padding: '10px', fontWeight: '600', color: theme.textPrimary }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Avatar usuario={esYo ? { ...u, foto: currentUser?.foto ?? u.foto, nombre_mostrar: currentUser?.nombre_mostrar ?? u.nombre_mostrar } : u} tam={30} color={theme.accent} />
                                <span>
                                  {u.nombre_mostrar || u.username}{esYo && <span style={{ fontWeight: 'normal', color: theme.textSecondary }}> (tú)</span>}
                                  <span style={{ display: 'block', fontWeight: 'normal', fontSize: '11px', color: theme.textSecondary }}>
                                    {u.nombre_mostrar ? `@${u.username}` : ''}{u.nombre_mostrar && typeof u.expedientes === 'number' ? ' · ' : ''}{typeof u.expedientes === 'number' ? `${u.expedientes} expediente${u.expedientes === 1 ? '' : 's'}` : ''}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td data-etiqueta="Rol" style={{ padding: '10px', color: theme.textSecondary }}>{esUsuarioAdmin ? 'Administrador' : 'Operador'}</td>
                            <td data-etiqueta="Estado" style={{ padding: '10px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '999px', backgroundColor: activo ? '#dcfce7' : '#f1f5f9', color: activo ? '#166534' : '#475569' }}>
                                {activo ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td className="celda-acciones" style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {!esYo && (
                                <button type="button" onClick={() => setModalPassword({ modo: 'reset', usuario: u })} style={{ ...btnIcono, color: theme.accent }} title="Asignar nueva contraseña">
                                  <KeyRound size={16} />
                                </button>
                              )}
                              {!esYo && u.username !== 'admin' && (
                                <button type="button" onClick={() => handleCambiarRol(u)} style={{ ...btnIcono, color: u.es_admin ? '#7c3aed' : theme.textSecondary }} title={u.es_admin ? 'Quitar permisos de administrador' : 'Hacer administrador'}>
                                  {u.es_admin ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                                </button>
                              )}
                              {!esUsuarioAdmin && !esYo && (
                                <button type="button" onClick={() => handleCambiarActivo(u)} style={{ ...btnIcono, color: activo ? '#d97706' : '#16a34a' }} title={activo ? 'Desactivar usuario' : 'Activar usuario'}>
                                  <Power size={16} />
                                </button>
                              )}
                              {!esUsuarioAdmin ? (
                                <button
                                  type="button"
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

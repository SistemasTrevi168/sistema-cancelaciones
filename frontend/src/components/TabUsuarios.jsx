import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { useApp } from '../AppContext';

export default function TabUsuarios() {
  const {
    handleCrearUsuario,
    handleEliminarUsuario,
    loadingUsuarios,
    nuevoUsuario,
    setNuevoUsuario,
    theme,
    usuariosLista
  } = useApp();

  return (
<div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
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
                    style={{ width: '100%', backgroundColor: theme.accent, color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                  >
                    Guardar Usuario
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
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '10px' }}>Usuario</th>
                        <th style={{ padding: '10px' }}>Rol</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosLista.map((u) => {
                        const esUsuarioAdmin = u.es_admin || u.role === 'admin' || u.username === 'admin';
                        return (
                          <tr key={u.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '10px', fontWeight: '600', color: theme.textPrimary }}>{u.username}</td>
                            <td style={{ padding: '10px', color: theme.textSecondary }}>{esUsuarioAdmin ? 'Administrador' : 'Operador'}</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              {!esUsuarioAdmin ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleEliminarUsuario(e, u.id)}
                                  style={{ backgroundColor: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', padding: '6px' }}
                                  title="Eliminar usuario"
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', color: theme.textSecondary, fontStyle: 'italic' }}>Protegido</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
  );
}


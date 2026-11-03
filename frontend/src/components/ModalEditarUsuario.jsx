import { Loader2, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar } from '../ui/notificaciones';

// Editar los datos de una persona: nombre completo y si es mujer u hombre (para el saludo).
// El usuario con el que entra no cambia (sus expedientes y su historial dependen de él).
export default function ModalEditarUsuario({ usuario, onCerrar, onGuardado }) {
  const { theme, isDarkMode } = useApp();
  const [nombre, setNombre] = useState(usuario.nombre_mostrar || '');
  const [genero, setGenero] = useState(usuario.genero === 'FEMENINO' || usuario.genero === 'MASCULINO' ? usuario.genero : '');
  const [elegido, setElegido] = useState(!!usuario.genero_fijo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Mientras no se elija a mano, se propone según el nombre (igual que el saludo)
  useEffect(() => {
    const n = (nombre || usuario.username || '').trim();
    if (elegido || !n) return undefined;
    let vivo = true;
    const t = setTimeout(() => {
      api.post('/admin/genero-de-nombre', { nombre: n })
        .then((r) => { if (vivo && r.data?.genero) setGenero(r.data.genero); })
        .catch(() => {});
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [nombre, elegido, usuario.username]);

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape' && !guardando) onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [guardando, onCerrar]);

  const guardar = async (e) => {
    e.preventDefault();
    const limpio = nombre.split(/\s+/).filter(Boolean).join(' ');
    if (limpio.length > 60) { setError('El nombre puede tener máximo 60 caracteres.'); return; }
    if (!genero) { setError('Elige si es mujer u hombre.'); return; }
    setGuardando(true);
    setError('');
    try {
      const r = await api.put(`/admin/usuarios/${usuario.id}`, { nombre_mostrar: limpio, genero });
      avisar.exito(`Listo: se guardaron los datos de ${r.data?.nombre_mostrar || usuario.username}.`);
      onGuardado?.(r.data);
      onCerrar();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudieron guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  };

  const etiqueta = { display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' };
  return (
    <div className="fondo-editar-usuario" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: '16px' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}>
      <form onSubmit={guardar} className="slide-up editar-usuario" role="dialog" aria-modal="true" aria-label={`Editar a ${usuario.username}`}
        style={{ backgroundColor: theme.cardBg, padding: '28px', borderRadius: '16px', maxWidth: '420px', width: '100%', border: `1px solid ${theme.border}`, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
        <div style={{ backgroundColor: `${theme.accent}${isDarkMode ? '33' : '14'}`, width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
          <Pencil color={theme.accent} size={22} />
        </div>
        <h3 style={{ margin: '0 0 6px 0', color: theme.textPrimary, fontSize: '19px', fontWeight: '700' }}>Editar usuario</h3>
        <p style={{ color: theme.textSecondary, fontSize: '13px', margin: '0 0 18px 0' }}>
          Usuario para entrar: <strong style={{ color: theme.textPrimary }}>@{usuario.username}</strong> (no cambia).
        </p>

        <label style={etiqueta} htmlFor="editar-nombre">Nombre completo</label>
        <input id="editar-nombre" type="text" value={nombre} maxLength={60} autoFocus onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Meredith López García"
          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box', marginBottom: '6px' }} />
        <p style={{ color: theme.textSecondary, fontSize: '11.5px', margin: '0 0 16px 0' }}>Así aparece en el saludo, el menú, los reportes y la lista para compartir.</p>

        <span style={etiqueta}>¿Mujer u hombre?</span>
        <div className="alta-genero editar-genero" style={{ color: theme.textSecondary, marginTop: 0 }}>
          <span>
            {genero ? <>Se le saludará <strong style={{ color: theme.textPrimary }}>«{genero === 'FEMENINO' ? 'Bienvenida' : 'Bienvenido'}»</strong>{!elegido && ' (según su nombre)'}</> : 'Elige una opción:'}
          </span>
          <span className="alta-genero-opciones" role="radiogroup" aria-label="Mujer u hombre">
            {[['FEMENINO', 'Mujer'], ['MASCULINO', 'Hombre']].map(([g, txt]) => (
              <button key={g} type="button" role="radio" aria-checked={genero === g} onClick={() => { setGenero(g); setElegido(true); }}
                className={genero === g ? 'activo' : ''}
                style={genero === g ? { backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent } : { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.inputBg }}>
                {txt}
              </button>
            ))}
          </span>
        </div>

        {error && (
          <div style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', color: isDarkMode ? '#fca5a5' : '#991b1b', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', margin: '14px 0 0' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <button type="button" onClick={onCerrar} disabled={guardando} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subtleBg, color: theme.textPrimary, fontWeight: '600', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: '#fff', fontWeight: '600', cursor: guardando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {guardando && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />} Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

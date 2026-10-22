import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Wand2 } from 'lucide-react';
import { useApp } from '../AppContext';

// Ventana para cambiar la contraseña propia o (admin) asignar una nueva a otro usuario
// etiquetaNueva: texto del campo nuevo; generar: botón para proponer una contraseña temporal; textoCancelar: p. ej. «Cerrar sesión»
export default function ModalPassword({ titulo, descripcion, etiquetaActual = 'Contraseña actual', etiquetaNueva = 'Contraseña nueva (mínimo 6 caracteres)', generar = false, textoCancelar = 'Cancelar', onCancelar, onGuardar }) {
  const { theme, isDarkMode } = useApp();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!actual) return setError(`Escribe: ${etiquetaActual.toLowerCase()}.`);
    if (nueva.length < 6) return setError('La contraseña nueva debe tener al menos 6 caracteres.');
    if (nueva !== confirmar) return setError('Las contraseñas nuevas no coinciden.');
    if (nueva === actual && !generar) return setError('La contraseña nueva debe ser diferente a la actual.');
    setGuardando(true);
    try {
      await onGuardar(actual, nueva);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar la contraseña.');
    } finally {
      setGuardando(false);
    }
  };

  // Propone una contraseña fácil de dictar: Palabra + 4 números + símbolo (p. ej. «Notaria4821!»)
  const generarTemporal = () => {
    const palabras = ['Notaria', 'Folio', 'Escritura', 'Registro', 'Credito', 'Hipoteca', 'Acta', 'Firma'];
    const aleatorio = (n) => (window.crypto?.getRandomValues ? window.crypto.getRandomValues(new Uint32Array(1))[0] % n : Math.floor(Math.random() * n));
    const p = `${palabras[aleatorio(palabras.length)]}${String(1000 + aleatorio(9000))}${'!#$%&*'[aleatorio(6)]}`;
    setNueva(p); setConfirmar(p); setMostrar(true); setError('');
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '14px', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' };

  const campo = (label, valor, setValor, autoFocus, oculto = false) => (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={mostrar && !oculto ? 'text' : 'password'}
        value={valor}
        autoFocus={autoFocus}
        required
        onChange={(e) => setValor(e.target.value)}
        style={inputStyle}
      />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: '16px' }}>
      <form onSubmit={handleSubmit} className="slide-up" style={{ backgroundColor: theme.cardBg, padding: '28px', borderRadius: '16px', maxWidth: '400px', width: '100%', border: `1px solid ${theme.border}`, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
        <div style={{ backgroundColor: `${theme.accent}${isDarkMode ? '33' : '14'}`, width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
          <KeyRound color={theme.accent} size={24} />
        </div>
        <h3 style={{ margin: '0 0 6px 0', color: theme.textPrimary, fontSize: '19px', fontWeight: '700' }}>{titulo}</h3>
        {descripcion && <p style={{ color: theme.textSecondary, fontSize: '13px', margin: '0 0 18px 0' }}>{descripcion}</p>}

        {/* Al restablecer, la contraseña del administrador nunca se muestra */}
        {campo(etiquetaActual, actual, setActual, true, generar)}
        {campo(etiquetaNueva, nueva, setNueva, false)}
        {generar && (
          <button type="button" onClick={generarTemporal} style={{ background: 'transparent', border: 'none', color: theme.accent, fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: 0, margin: '-6px 0 14px' }}>
            <Wand2 size={14} /> Generar una contraseña temporal
          </button>
        )}
        {campo('Confirmar contraseña nueva', confirmar, setConfirmar, false)}

        <button type="button" onClick={() => setMostrar(!mostrar)} style={{ background: 'transparent', border: 'none', color: theme.textSecondary, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: 0, marginBottom: '14px' }}>
          {mostrar ? <EyeOff size={14} /> : <Eye size={14} />} {mostrar ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
        </button>

        {error && (
          <div style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', color: isDarkMode ? '#fca5a5' : '#991b1b', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="button" onClick={onCancelar} disabled={guardando} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subtleBg, color: theme.textPrimary, fontWeight: '600', cursor: 'pointer' }}>
            {textoCancelar}
          </button>
          <button type="submit" disabled={guardando} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: theme.accent, color: '#fff', fontWeight: '600', cursor: guardando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {guardando && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />} Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

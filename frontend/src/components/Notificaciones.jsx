import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useApp } from '../AppContext';
import { quitarAviso, suscribir } from '../ui/notificaciones';

const ESTILOS = {
  exito: { fondo: '#ecfdf5', borde: '#6ee7b7', texto: '#065f46', icono: CheckCircle, color: '#10b981' },
  info: { fondo: '#eff6ff', borde: '#93c5fd', texto: '#1e3a8a', icono: Info, color: '#3b82f6' },
  aviso: { fondo: '#fffbeb', borde: '#fcd34d', texto: '#92400e', icono: AlertTriangle, color: '#d97706' },
  error: { fondo: '#fef2f2', borde: '#fca5a5', texto: '#991b1b', icono: AlertCircle, color: '#ef4444' },
};

// Muestra los avisos flotantes (esquina inferior derecha) y la ventana de confirmación
export default function Notificaciones() {
  const { theme, isDarkMode } = useApp();
  const [estado, setEstado] = useState({ avisos: [], confirmacion: null });
  const botonConfirmarRef = useRef(null);

  useEffect(() => suscribir(setEstado), []);

  const { avisos, confirmacion } = estado;

  useEffect(() => {
    if (!confirmacion) return;
    botonConfirmarRef.current?.focus();
    const alTeclear = (e) => {
      if (e.key === 'Escape') confirmacion.responder(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [confirmacion]);

  return (
    <>
      <div className="avisos-flotantes" aria-live="polite">
        {avisos.map((a) => {
          const e = ESTILOS[a.tipo] || ESTILOS.info;
          const Icono = e.icono;
          return (
            <div
              key={a.id}
              role={a.tipo === 'error' ? 'alert' : 'status'}
              className="aviso-entrada"
              style={{
                backgroundColor: isDarkMode ? theme.cardBg : e.fondo,
                border: `1px solid ${isDarkMode ? e.color : e.borde}`,
                borderLeft: `4px solid ${e.color}`,
                color: isDarkMode ? theme.textPrimary : e.texto,
              }}
            >
              <Icono size={18} color={e.color} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{a.mensaje}</span>
              <button type="button" onClick={() => quitarAviso(a.id)} aria-label="Cerrar aviso" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, opacity: 0.6, display: 'flex' }}>
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {confirmacion && (
        <div
          className="fondo-modal"
          onMouseDown={(e) => { if (e.target === e.currentTarget) confirmacion.responder(false); }}
        >
          <div role="dialog" aria-modal="true" className="modal-entrada" style={{ backgroundColor: theme.cardBg, padding: '28px', borderRadius: '16px', maxWidth: '440px', width: '100%', border: `1px solid ${theme.border}`, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ backgroundColor: confirmacion.peligro ? (isDarkMode ? '#450a0a' : '#fff1f2') : (isDarkMode ? '#422006' : '#fffbeb'), width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <AlertTriangle color={confirmacion.peligro ? '#dc2626' : '#d97706'} size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: theme.textPrimary, fontSize: '19px', fontWeight: '700' }}>{confirmacion.titulo}</h3>
            <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '0 0 22px 0', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{confirmacion.mensaje}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" onClick={() => confirmacion.responder(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subtleBg, color: theme.textPrimary, fontWeight: '600', cursor: 'pointer' }}>
                {confirmacion.textoCancelar}
              </button>
              <button ref={botonConfirmarRef} type="button" onClick={() => confirmacion.responder(true)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: confirmacion.peligro ? '#dc2626' : theme.accent, color: '#fff', fontWeight: '600', cursor: 'pointer' }}>
                {confirmacion.textoConfirmar}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

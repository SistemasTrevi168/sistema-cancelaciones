import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageSquareText, Save, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar } from '../ui/notificaciones';

import { MAX_OBSERVACIONES, textoObservaciones } from '../ui/observaciones';

// Observaciones del expediente: notas internas (no van en el Word ni cambian su estado).

// Recuadro para escribirlas (al crear o editar el expediente)
export function CampoObservaciones({ id, valor, onCambio, compacto = false, ayuda = 'Notas internas para ti y con quien lo compartas. No aparecen en el Word.' }) {
  const { theme } = useApp();
  const v = String(valor ?? '');
  return (
    <div className={`campo-observaciones${compacto ? ' compacto' : ''}`} style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
      <label htmlFor={id} style={{ color: theme.textPrimary }}>
        <MessageSquareText size={15} color="#a16207" /> Observaciones
        <span style={{ color: theme.textSecondary }}>(opcional)</span>
      </label>
      <textarea
        id={id}
        rows={compacto ? 2 : 3}
        maxLength={MAX_OBSERVACIONES}
        value={v}
        placeholder="Ej.: falta firma del acreditado, el notario pidió copia del INE, se entregó a Juan…"
        onChange={(e) => onCambio(e.target.value)}
        style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
      />
      <small style={{ color: theme.textSecondary }}>
        <span>{ayuda}</span>
        {v.length > MAX_OBSERVACIONES * 0.8 && <span>{v.length}/{MAX_OBSERVACIONES}</span>}
      </small>
    </div>
  );
}

// Botón de las tablas: muestra si tiene observaciones y abre la ventana para verlas o cambiarlas
export function BotonObservaciones({ expediente, onAbrir, className = '' }) {
  const { theme } = useApp();
  const texto = textoObservaciones(expediente);
  return (
    <button
      type="button"
      className={`boton-observaciones ${texto ? 'con-texto' : ''} ${className}`}
      onClick={(e) => { e.stopPropagation(); onAbrir(expediente); }}
      title={texto ? `Observaciones: ${texto.length > 160 ? `${texto.slice(0, 160)}…` : texto}` : 'Agregar observaciones'}
      aria-label={texto ? 'Ver observaciones' : 'Agregar observaciones'}
      style={{ color: texto ? '#a16207' : theme.textSecondary, backgroundColor: texto ? '#fef9c3' : theme.subtleBg, borderColor: texto ? '#fde68a' : theme.border }}
    >
      <MessageSquareText size={16} />
    </button>
  );
}

// Ventana para ver y cambiar las observaciones de un expediente guardado
export function ModalObservaciones({ expediente, onCerrar, onGuardado }) {
  const { theme } = useApp();
  const original = textoObservaciones(expediente);
  const [texto, setTexto] = useState(original);
  const [guardando, setGuardando] = useState(false);
  const area = useRef(null);
  useEffect(() => {
    const el = area.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const id = expediente?.id || expediente?.expediente_id;
  const nombre = expediente?.acreditado || expediente?.datos_extraidos?.nombre_acreditado || 'Expediente';
  const credito = expediente?.numero_credito || expediente?.datos_extraidos?.numero_credito || '';

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await api.put(`/expedientes/${id}/observaciones`, { observaciones: texto });
      onGuardado?.(id, res.data?.observaciones ?? texto, res.data?.expediente);
      avisar.exito(res.data?.observaciones ? 'Se guardaron las observaciones.' : 'Se quitaron las observaciones.');
      onCerrar();
    } catch (err) {
      avisar.error(err.response?.status === 404 && !err.response?.data?.detail
        ? 'Falta subir la actualización del servidor para guardar observaciones.'
        : (err.response?.data?.detail || 'No se pudieron guardar las observaciones.'));
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div className="fondo-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal-observaciones modal-entrada" role="dialog" aria-modal="true" aria-labelledby="titulo-observaciones"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
        <header>
          <span className="modal-observaciones-icono"><MessageSquareText size={18} /></span>
          <div>
            <h3 id="titulo-observaciones">Observaciones</h3>
            <p style={{ color: theme.textSecondary }}>{nombre}{credito ? ` · Crédito ${credito}` : ''}</p>
          </div>
          <button type="button" className="modal-observaciones-cerrar" onClick={onCerrar} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={18} /></button>
        </header>
        <textarea
          ref={area}
          rows={6}
          maxLength={MAX_OBSERVACIONES}
          value={texto}
          placeholder="Escribe aquí las notas de este expediente…"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardar(); }}
          style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
        />
        <p className="modal-observaciones-nota" style={{ color: theme.textSecondary }}>
          Las ven tú, el administrador y con quien lo compartas. No aparecen en el Word ni cambian el estado del expediente.
        </p>
        <footer>
          <button type="button" className="boton-barra" onClick={onCerrar} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>Cancelar</button>
          <button type="button" className="boton-barra" onClick={guardar} disabled={guardando || texto.trim() === original}
            style={{ backgroundColor: theme.accent, borderColor: theme.accent, color: '#fff' }}>
            {guardando ? <Loader2 size={14} className="girando" /> : <Save size={14} />} Guardar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

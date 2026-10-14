import { useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useApp } from '../AppContext';
import { nombrePlantilla } from '../plantillasCatalogo';

// Aviso "Este expediente puede usar la plantilla…" con el porqué y un botón para usarla
export default function SugerenciaPlantilla({ sugerencia, actual, onUsar }) {
  const { theme, isDarkMode } = useApp();
  const [verPorque, setVerPorque] = useState(false);
  if (!sugerencia?.plantilla) return null;
  const enUso = String(actual || '').replace(/\.docx$/i, '') === sugerencia.plantilla;

  return (
    <div
      className="sugerencia-plantilla"
      style={{
        border: `1px solid ${enUso ? (isDarkMode ? '#166534' : '#a7f3d0') : (isDarkMode ? '#4c1d95' : '#ddd6fe')}`,
        backgroundColor: enUso ? (isDarkMode ? '#052e16' : '#ecfdf5') : (isDarkMode ? '#1e1b4b' : '#f5f3ff'),
        color: theme.textPrimary,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {enUso ? <CheckCircle size={18} color="#10b981" /> : <Sparkles size={18} color="#7c3aed" />}
        <div style={{ flex: 1, minWidth: '180px', fontSize: '13px', lineHeight: 1.45 }}>
          {enUso ? 'Estás usando la plantilla que corresponde según los documentos:' : 'Según los documentos, este expediente puede usar la plantilla:'}
          <div style={{ fontWeight: 700, fontSize: '14px' }}>{nombrePlantilla(sugerencia.plantilla)}</div>
        </div>
        {!enUso && (
          <button type="button" onClick={() => onUsar(sugerencia.plantilla)} className="boton-usar-sugerencia">
            Usar esta plantilla
          </button>
        )}
      </div>

      {sugerencia.dudas?.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginTop: '8px', fontSize: '12px', color: isDarkMode ? '#fcd34d' : '#92400e' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>Revísala: {sugerencia.dudas.join('. ')}.</span>
        </div>
      )}

      <button type="button" onClick={() => setVerPorque(!verPorque)} style={{ background: 'none', border: 'none', padding: 0, marginTop: '6px', color: theme.accent, fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
        ¿Por qué esta plantilla? {verPorque ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {verPorque && (
        <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>
          {sugerencia.razones.map((r) => <li key={r}>{r}</li>)}
          <li>Si no es la correcta, elige otra en el selector.</li>
        </ul>
      )}
    </div>
  );
}

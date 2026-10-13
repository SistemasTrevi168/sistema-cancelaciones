import { API_BASE } from '../api';
import { useApp } from '../AppContext';

export default function TabManual() {
  const {
    cargando,
    expedientes,
    formData,
    manualPreviewRef,
    selectedPlantilla,
    setCargando,
    setExpedientes,
    setFormData,
    setSelectedPlantilla,
    theme
  } = useApp();

  return (
<div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', alignItems: 'start' }}>    

    {/* COLUMNA IZQUIERDA: FORMULARIO */}
    <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}`, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
      <h3 style={{ color: theme.textPrimary, marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>Generación Manual de Caso Individual</h3>
      
      <form onSubmit={async (e) => {
        e.preventDefault();
        setCargando(true);
        try {
          // Recuperar token de autenticación si lo guardas en localStorage (para evitar el error 401)
          const token = localStorage.getItem('token') || '';

          const res = await fetch(`${API_BASE}/api/expedientes/generar-manual`, {
            method: 'POST',
            credentials: 'include',
            headers: { 
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ ...formData, plantilla: selectedPlantilla || 'CDMX_AP_H_SOLTERO' })
          });
          const data = await res.json();
          if (res.ok && data.status === 'exito') {
            alert('¡Expediente manual generado con éxito, revisa tu Historial!');
            
            if (data.archivo_base64 && manualPreviewRef.current) {
              const binaryString = window.atob(data.archivo_base64);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              await window.docx.renderAsync(bytes.buffer, manualPreviewRef.current, null, {
                className: "docx-wrapper",
                inWrapper: true,
                ignoreWidth: false,
                ignoreHeight: false,
              });
            }

            if (typeof setExpedientes === 'function' && Array.isArray(expedientes)) {
              setExpedientes([data, ...expedientes]);
            }
          } else {
            alert('Error: ' + (data.detail || 'No se pudo generar'));
          }
        } catch (err) {
          console.error(err);
          alert('Error de conexión con el servidor.');
        } finally {
          setCargando(false);
        }
      }} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        
        {/* SELECTOR DE PLANTILLA NOTARIAL 2026 (Ocupa todo el ancho) */}
        <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textPrimary, marginBottom: '8px' }}>
            📜 Selecciona la Plantilla Notarial (Modelo 2026):
          </label>
          <select
            value={selectedPlantilla}
            onChange={(e) => setSelectedPlantilla(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.inputBg || '#fff',
              color: theme.textPrimary,
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <optgroup label="CDMX - APERTURA DE CRÉDITO">
              <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
              <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
              <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
              <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
            </optgroup>
            <optgroup label="CONTRATO DE MUTUO">
              <option value="CDMX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
              <option value="CDMX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
              <option value="CDMX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
              <option value="CDMX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
            </optgroup>
            <optgroup label="MODELOS COACREDITADOS">
              <option value="COAC_CDMX_AP">CDMX - Ap. Crédito</option>
              <option value="COAC_CDMX_MUTUO">CDMX - C. Mutuo</option>
              <option value="COAC_EDOMEX_AP">EDOMEX - Ap. Crédito</option>
              <option value="COAC_EDOMEX_MUTUO">EDOMEX - C. Mutuo</option>
            </optgroup>
            <optgroup label="EDOMEX - APERTURA DE CRÉDITO">
              <option value="EDOMEX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
              <option value="EDOMEX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
              <option value="EDOMEX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
              <option value="EDOMEX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
            </optgroup>
            <optgroup label="EDOMEX - CONTRATO DE MUTUO">
              <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
              <option value="EDOMEX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
              <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
              <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
            </optgroup>
          </select>
        </div>

        {/* TODOS LOS CAMPOS DEL FORMULARIO MANUAL */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Número de Crédito *</label>
          <input
            type="text"
            required
            placeholder="Ej. 0903066392"
            value={formData.numero_credito}
            onChange={e => setFormData({...formData, numero_credito: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Nombre del Acreditado *</label>
          <input
            type="text"
            required
            placeholder="Ej. MARIA IDALIA CARRASCO BARDALES"
            value={formData.nombre_acreditado}
            onChange={e => setFormData({...formData, nombre_acreditado: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Monto del Crédito</label>
          <input
            type="text"
            placeholder="Ej. 150000.00"
            value={formData.monto_credito}
            onChange={e => setFormData({...formData, monto_credito: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Oficina Registral</label>
          <input
            type="text"
            placeholder="Ej. TOLUCA"
            value={formData.oficina_registral}
            onChange={e => setFormData({...formData, oficina_registral: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Número de Carta</label>
          <input
            type="text"
            value={formData.numero_carta}
            onChange={e => setFormData({...formData, numero_carta: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Entidad Financiera (Banco)</label>
          <input
            type="text"
            placeholder="Ej. INFONAVIT"
            value={formData.entidad_financiera}
            onChange={e => setFormData({...formData, entidad_financiera: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Fecha de Liquidación</label>
          <input
            type="text"
            value={formData.fecha_liquidacion}
            onChange={e => setFormData({...formData, fecha_liquidacion: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Folio Real</label>
          <input
            type="text"
            value={formData.folio_real}
            onChange={e => setFormData({...formData, folio_real: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Fecha de Expedición</label>
          <input
            type="text"
            value={formData.fecha_expedicion}
            onChange={e => setFormData({...formData, fecha_expedicion: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Crédito a Salario</label>
          <input
            type="text"
            value={formData.credito_a_salario}
            onChange={e => setFormData({...formData, credito_a_salario: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Datos del Inmueble</label>
          <textarea
            rows="2"
            value={formData.datos_inmueble}
            onChange={e => setFormData({...formData, datos_inmueble: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none', resize: 'vertical' }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
          <button
            type="submit"
            disabled={cargando}
            style={{ width: '100%', padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            {cargando ? 'Generando Documento...' : 'Generar documento en Mi Historial'}
          </button>
        </div>
      </form>
    </div>
  </div>
  );
}


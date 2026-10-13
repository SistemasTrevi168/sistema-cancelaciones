import { Eye } from 'lucide-react';
import { API_BASE, encabezadosSesion } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import OpcionesPlantilla from './OpcionesPlantilla';

export default function TabManual() {
  const {
    abrirVistaPrevia,
    vistaPrevia,
    faltantesPara,
    mensajeFaltantesManual,
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
        const faltan = faltantesPara(formData, selectedPlantilla || 'CDMX_AP_H_SOLTERO');
        if (faltan.length > 0 && !(await confirmar(mensajeFaltantesManual(faltan), { titulo: 'Faltan datos', textoConfirmar: 'Generar de todas formas' }))) return;
        setCargando(true);
        try {

          const res = await fetch(`${API_BASE}/api/expedientes/generar-manual`, {
            method: 'POST',
            credentials: 'include',
            headers: encabezadosSesion({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ ...formData, plantilla: selectedPlantilla || 'CDMX_AP_H_SOLTERO' })
          });
          const data = await res.json();
          if (res.ok && data.status === 'exito') {
            avisar.exito('Expediente generado. Lo encuentras en Mi Historial.');
            
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
            avisar.error('Error: ' + (data.detail || 'No se pudo generar'));
          }
        } catch (err) {
          console.error(err);
          avisar.error('Error de conexión con el servidor.');
        } finally {
          setCargando(false);
        }
      }} className="grid-formulario" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        
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
            <OpcionesPlantilla />
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

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Número de Escritura</label>
          <input
            type="text"
            value={formData.numero_escritura}
            onChange={e => setFormData({...formData, numero_escritura: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Fecha de Escritura</label>
          <input
            type="text"
            value={formData.fecha_escritura}
            onChange={e => setFormData({...formData, fecha_escritura: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Notario de Origen</label>
          <input
            type="text"
            value={formData.notario_origen_completo}
            onChange={e => setFormData({...formData, notario_origen_completo: e.target.value})}
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

        <div style={{ gridColumn: '1 / -1', marginTop: '10px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => abrirVistaPrevia({ origen: 'manual' })}
            style={{ flex: '0 0 auto', padding: '12px 18px', backgroundColor: vistaPrevia?.origen === 'manual' ? theme.accent : theme.subtleBg, color: vistaPrevia?.origen === 'manual' ? '#fff' : theme.textPrimary, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Eye size={16} /> Vista previa
          </button>
          <button
            type="submit"
            disabled={cargando}
            style={{ flex: 1, minWidth: '220px', padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            {cargando ? 'Generando Documento...' : 'Generar documento en Mi Historial'}
          </button>
        </div>
      </form>
    </div>
  </div>
  );
}


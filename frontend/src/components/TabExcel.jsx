import { FileSpreadsheet } from 'lucide-react';
import { useApp } from '../AppContext';
import { avisar } from '../ui/notificaciones';

export default function TabExcel() {
  const {
    archivoExcel,
    cargando,
    contadoresRemosion,
    estadoFilas,
    filasPreview,
    filasSeleccionadas,
    handleExcelSubmit,
    handlePreviewExcel,
    isDarkMode,
    paginaActual,
    plantillasFilas,
    progreso,
    selectedPlantilla,
    setArchivoExcel,
    setFilasPreview,
    setFilasSeleccionadas,
    setPaginaActual,
    setPlantillasFilas,
    setSelectedPlantilla,
    textoProgreso,
    theme
  } = useApp();


  const filasPorPagina = 10;
  const totalPaginas = Math.ceil((filasPreview?.length || 0) / filasPorPagina);
  const indiceUltimaFila = paginaActual * filasPorPagina;
  const indicePrimeraFila = indiceUltimaFila - filasPorPagina;
  const filasPaginadas = (filasPreview || []).slice(indicePrimeraFila, indiceUltimaFila);

  const OpcionesPlantillas = () => (
    <>
      <optgroup label="CDMX - APERTURA DE CRÉDITO">
        <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
        <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
        <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
        <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
      </optgroup>
      <optgroup label="CDMX - CONTRATO DE MUTUO">
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
    </>
  );

  return (
    <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}`, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
      <h3 style={{ color: theme.textPrimary, marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>Carga Masiva mediante Excel o CSV</h3>
      
      {/* SELECTOR DE PLANTILLA GLOBAL */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textPrimary, marginBottom: '8px' }}>
          📜 Plantilla Notarial Global por Defecto (Modelo 2026):
        </label>
        <select
          value={selectedPlantilla}
          onChange={(e) => setSelectedPlantilla(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, fontSize: '13px', fontWeight: '600', cursor: 'pointer', outline: 'none' }}
        >
          <OpcionesPlantillas />
        </select>
      </div>

      {/* ZONA DE ARRASTRE O TABLA DE PREVISUALIZACIÓN */}
      {!filasPreview || filasPreview.length === 0 ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              const archivoArrastrado = e.dataTransfer.files[0];
              const nombre = archivoArrastrado.name.toLowerCase();
              if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls') || nombre.endsWith('.csv')) {
                await handlePreviewExcel(archivoArrastrado);
                setPaginaActual(1);
              } else {
                avisar.aviso("Por favor, arrastra un archivo Excel o CSV válido (.xlsx, .xls, .csv)");
              }
            }
          }}
          style={{ border: `2px dashed ${theme.border}`, padding: '32px', borderRadius: '12px', textAlign: 'center', backgroundColor: theme.subtleBg, cursor: 'pointer', marginBottom: '16px' }}
        >
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={async (e) => {
              if (e.target.files[0]) {
                await handlePreviewExcel(e.target.files[0]);
                setPaginaActual(1);
              }
            }}
            style={{ display: 'none' }}
            id="excel-file-input"
          />
          <label htmlFor="excel-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%', height: '100%' }}>
            <FileSpreadsheet size={36} color={theme.accent} />
            <span style={{ color: theme.textPrimary, fontWeight: '600' }}>
              {archivoExcel ? archivoExcel.name : 'Haz clic para seleccionar tu archivo Excel o arrástralo aquí'}
            </span>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>Formatos permitidos: .xlsx, .xls, .csv</span>
          </label>
        </div>
      ) : (
        /* TABLA CON PAGINACIÓN Y SELECTOR POR FILA */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: theme.subtleBg, borderRadius: '8px' }}>
            <span style={{ color: theme.textPrimary, fontWeight: '600', fontSize: '14px' }}>
              Archivo: <strong>{archivoExcel?.name}</strong> ({filasPreview.length} registros - Pág. {paginaActual} de {totalPaginas})
            </span>
            <button
              onClick={() => { setFilasPreview([]); setArchivoExcel(null); setFilasSeleccionadas([]); setPaginaActual(1); }}
              style={{ padding: '6px 12px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
            >
              Cambiar Archivo
            </button>
          </div>

          <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.subtleBg }}>
                  <th style={{ padding: '12px', textAlign: 'center', width: '50px' }}>
                    <input 
                      type="checkbox"
                      disabled={cargando || filasPreview.length === 0}
                      checked={filasPreview.length > 0 && filasSeleccionadas.length === filasPreview.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilasSeleccionadas(filasPreview.map(f => f.index));
                        } else {
                          setFilasSeleccionadas([]);
                        }
                      }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }}
                    />
                  </th>
                  <th style={{ padding: '12px' }}>No. Crédito</th>
                  <th style={{ padding: '12px' }}>Acreditado</th>
                  <th style={{ padding: '12px' }}>Monto</th>
                  <th style={{ padding: '12px' }}>Plantilla Específica</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filasPaginadas.map((fila) => {
                  const isSelected = filasSeleccionadas.includes(fila.index);
                  const estadoFila = estadoFilas[fila.index];

                  return (
                    <tr key={fila.index} style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: isSelected ? (isDarkMode ? '#1e293b' : '#f8fafc') : 'transparent' }}>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          disabled={cargando}
                          onChange={() => {
                            if (isSelected) {
                              setFilasSeleccionadas(filasSeleccionadas.filter(i => i !== fila.index));
                            } else {
                              setFilasSeleccionadas([...filasSeleccionadas, fila.index]);
                            }
                          }}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }}
                        />
                      </td>
                      <td style={{ padding: '12px', color: theme.textPrimary, fontWeight: '500' }}>{fila.numero_credito || fila.credito || '-'}</td>
                      <td style={{ padding: '12px', color: theme.textPrimary }}>{fila.nombre_acreditado || fila.acreditado || '-'}</td>
                      <td style={{ padding: '12px', color: theme.textPrimary }}>{fila.monto_credito || fila.monto || '-'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <select
                          value={plantillasFilas?.[fila.index] || selectedPlantilla}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPlantillasFilas(prev => ({ ...prev, [fila.index]: val }));
                          }}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, fontSize: '12px', cursor: 'pointer', outline: 'none' }}
                        >
                          <OpcionesPlantillas />
                        </select>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {estadoFila === 'completado' ? (
                          <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', display: 'inline-block' }}>
                            ✓ {contadoresRemosion[fila.index] !== undefined ? `Quitando en ${contadoresRemosion[fila.index]}s` : 'Completado'}
                          </span>
                        ) : estadoFila === 'procesando' ? (
                          <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', display: 'inline-block' }}>Procesando...</span>
                        ) : estadoFila === 'error' ? (
                          <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', display: 'inline-block' }}>✕ Error</span>
                        ) : (
                          <span style={{ color: '#ffa500', fontSize: '12px' }}>Pendiente</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* CONTROLES DE PAGINACIÓN */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px' }}>
              <button
                onClick={() => setPaginaActual(prev => Math.max(prev - 1, 1))}
                disabled={paginaActual === 1 || cargando}
                style={{ padding: '6px 14px', backgroundColor: paginaActual === 1 ? theme.subtleBg : theme.cardBg, color: paginaActual === 1 ? theme.textSecondary : theme.textPrimary, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: paginaActual === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600' }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: '13px', color: theme.textSecondary, fontWeight: '500' }}>
                Página <strong>{paginaActual}</strong> de <strong>{totalPaginas}</strong>
              </span>
              <button
                onClick={() => setPaginaActual(prev => Math.min(prev + 1, totalPaginas))}
                disabled={paginaActual === totalPaginas || cargando}
                style={{ padding: '6px 14px', backgroundColor: paginaActual === totalPaginas ? theme.subtleBg : theme.cardBg, color: paginaActual === totalPaginas ? theme.textSecondary : theme.textPrimary, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: paginaActual === totalPaginas ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600' }}
              >
                Siguiente →
              </button>
            </div>
          )}

          {/* BOTÓN DE ACCIÓN */}
          <button
            onClick={handleExcelSubmit}
            disabled={cargando || filasSeleccionadas.length === 0}
            style={{ width: '100%', padding: '14px 20px', backgroundColor: (cargando || filasSeleccionadas.length === 0) ? '#94a3b8' : theme.accent, color: '#ffffff', border: 'none', borderRadius: '10px', cursor: (cargando || filasSeleccionadas.length === 0) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '8px' }}
          >
            <span>⚡</span>
            {cargando ? 'Procesando lote y empaquetando ZIP...' : `Procesar Lote (${filasSeleccionadas.length} seleccionados)`}
          </button>

          {/* PROGRESO */}
          {cargando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: theme.subtleBg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: theme.textPrimary, fontWeight: '600' }}>
                <span>{textoProgreso}</span>
                <span>{progreso}%</span>
              </div>
              <div style={{ width: '100%', backgroundColor: theme.border, borderRadius: '8px', overflow: 'hidden', height: '10px' }}>
                <div style={{ width: `${progreso}%`, backgroundColor: theme.accent, height: '100%', transition: 'width 0.3s ease-in-out' }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

}


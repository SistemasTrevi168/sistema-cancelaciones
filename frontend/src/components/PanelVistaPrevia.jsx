import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Eye, Loader2, Maximize2, Minimize2, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useApp } from '../AppContext';
import { nombrePlantilla } from '../plantillasCatalogo';

// Vista previa del Word. Normalmente es una ventana flotante; con `embebido` va dentro de
// la pantalla (Captura Manual) y se actualiza mientras se escribe.
export default function PanelVistaPrevia({ embebido = false }) {
  const { theme, isDarkMode, vistaPrevia, estadoPrevia, documentoPrevia, cerrarVistaPrevia, refrescarVistaPrevia, cambiarLadoPrevia } = useApp();
  const [amplio, setAmplio] = useState(false);
  const [zoomManual, setZoomManual] = useState(null); // null = ajustar al ancho
  const [escalaAuto, setEscalaAuto] = useState(1);
  const cuerpoRef = useRef(null);
  const hojaRef = useRef(null);

  // Cerrar con Esc (solo mientras está abierta: si no, cada Esc redibujaría la app
  // y le quitaría la tecla a otras ventanas, como el visor de PDF)
  const cerrarRef = useRef(cerrarVistaPrevia);
  useEffect(() => { cerrarRef.current = cerrarVistaPrevia; });
  const abierta = !!vistaPrevia && !vistaPrevia.embebido;
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e) => { if (e.key === 'Escape' && !document.querySelector('.fondo-modal')) cerrarRef.current(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierta]);

  // Pinta el documento recibido
  useLayoutEffect(() => {
    if (!hojaRef.current) return;
    hojaRef.current.replaceChildren(...(documentoPrevia ? [documentoPrevia] : []));
  }, [documentoPrevia]);

  // Ajusta el tamaño de la hoja al ancho de la ventana
  useEffect(() => {
    const calcular = () => {
      const cuerpo = cuerpoRef.current;
      const pagina = hojaRef.current?.querySelector('section.docx');
      if (!cuerpo || !pagina) return;
      const anchoPagina = pagina.offsetWidth || 816;
      setEscalaAuto(Math.min(1.2, Math.max(0.3, (cuerpo.clientWidth - 40) / anchoPagina)));
    };
    calcular();
    const obs = new ResizeObserver(calcular);
    if (cuerpoRef.current) obs.observe(cuerpoRef.current);
    return () => obs.disconnect();
  }, [documentoPrevia, amplio]);

  if (!vistaPrevia || !!vistaPrevia.embebido !== embebido) return null;
  const lado = vistaPrevia.lado || 'derecha';
  const escala = zoomManual ?? escalaAuto;
  const boton = { background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <aside
      className={embebido ? 'previa-embebida' : `panel-previa panel-previa-${lado} ${amplio ? 'panel-previa-amplio' : ''}`}
      role={embebido ? 'region' : 'dialog'}
      aria-label="Vista previa del documento"
      style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textPrimary }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.subtleBg }}>
        <Eye size={18} color={theme.accent} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Vista previa{vistaPrevia.titulo ? ` · ${vistaPrevia.titulo}` : ''}
          </div>
          <div style={{ fontSize: '11px', color: theme.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nombrePlantilla(estadoPrevia.plantilla)}
            {estadoPrevia.cargando && <span style={{ color: theme.accent, fontWeight: 600 }}> · Actualizando…</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button type="button" style={boton} title="Alejar" onClick={() => setZoomManual(Math.max(0.3, +(escala - 0.1).toFixed(2)))}><ZoomOut size={15} /></button>
          <button type="button" style={{ ...boton, fontSize: '11px', fontWeight: 700, minWidth: '46px' }} title="Ajustar al ancho" onClick={() => setZoomManual(null)}>{Math.round(escala * 100)}%</button>
          <button type="button" style={boton} title="Acercar" onClick={() => setZoomManual(Math.min(2, +(escala + 0.1).toFixed(2)))}><ZoomIn size={15} /></button>
          {!embebido && <button type="button" style={boton} className="ocultar-celular" title="Mover al otro lado" onClick={cambiarLadoPrevia}><ArrowLeftRight size={15} /></button>}
          {!embebido && <button type="button" style={boton} className="ocultar-celular" title={amplio ? 'Reducir' : 'Ampliar'} onClick={() => setAmplio(!amplio)}>{amplio ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}
          <button type="button" style={boton} title="Volver a generar" onClick={refrescarVistaPrevia}><RefreshCw size={15} /></button>
          {!embebido && <button type="button" style={{ ...boton, backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }} title="Cerrar (Esc)" onClick={cerrarVistaPrevia}><X size={15} /></button>}
        </div>
      </header>

      <div ref={cuerpoRef} className="panel-previa-cuerpo" style={{ backgroundColor: isDarkMode ? '#0b1220' : '#e2e8f0' }}>
        {estadoPrevia.error && (
          <div style={{ margin: '16px', padding: '12px', borderRadius: '8px', backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', color: isDarkMode ? '#fca5a5' : '#991b1b', fontSize: '13px' }}>
            {estadoPrevia.error}
          </div>
        )}
        {!documentoPrevia && !estadoPrevia.error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: theme.textSecondary }}>
            <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '13px' }}>Generando vista previa…</span>
          </div>
        )}
        <div ref={hojaRef} className={`panel-previa-hoja ${estadoPrevia.cargando && documentoPrevia ? 'actualizando' : ''}`} style={{ zoom: escala }} />
      </div>
    </aside>
  );
}

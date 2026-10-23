import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CloudOff, Download, FileStack, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar } from '../ui/notificaciones';

const tamano = (b) => (b > 1024 * 1024 * 1024 ? `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
  : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(0, Math.round((b || 0) / 1024))} KB`);
const fechaLarga = (iso) => {
  const d = iso ? new Date(`${iso}T12:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
};

// PDF de los expedientes guardados en Backblaze B2 (solo admin): cuánto ocupan, y el respaldo
// de los que se van a borrar (12 meses después de «Entregado»; solo se borran ya respaldados).
export default function PanelPdfs() {
  const { theme, isDarkMode } = useApp();
  const [info, setInfo] = useState(null);
  const [bajando, setBajando] = useState(false);

  const cargar = useCallback(async () => {
    try { setInfo((await api.get('/admin/documentos/resumen')).data); } catch { setInfo({ error: true }); }
  }, []);
  useEffect(() => {
    let vivo = true;
    api.get('/admin/documentos/resumen').then((r) => { if (vivo) setInfo(r.data); }).catch(() => { if (vivo) setInfo({ error: true }); });
    return () => { vivo = false; };
  }, []);

  const descargar = async () => {
    setBajando(true);
    try {
      const res = await api.get('/admin/documentos/respaldo', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Respaldo_PDF_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      avisar.exito('Respaldo descargado. Guárdalo en un lugar seguro: esos PDF se borrarán del almacenamiento cuando les toque.');
      await cargar();
    } catch {
      avisar.error('No se pudo descargar el respaldo de los PDF.');
    } finally {
      setBajando(false);
    }
  };

  if (!info || info.error) return null; // servidor anterior o sin permiso: no se muestra
  const dias = info.dias_conservar || 365;
  const plazo = dias % 365 === 0 ? `${dias / 365 === 1 ? '12 meses' : `${dias / 365} años`}` : `${dias} días`;
  const pr = info.por_respaldar || {};
  return (
    <section className="panel-respaldos panel-pdfs" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
      <div className="panel-respaldos-encabezado">
        <span className="panel-respaldos-icono" style={{ backgroundColor: '#0891b21a', color: '#0891b2' }}>{info.configurado ? <FileStack size={20} /> : <CloudOff size={20} />}</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>PDF de los expedientes</h2>
          {info.configurado ? (
            <p style={{ color: theme.textSecondary }}>
              La carta y la constancia de cada expediente se guardan al guardarlo, y se abren solas al editarlo.
              {' '}<strong>{info.archivos} PDF</strong> de {info.expedientes} expediente(s) · {tamano(info.bytes)}.
              {' '}Se borran <strong>{plazo} después de marcar el expediente como «Entregado»</strong>, y solo después de que descargues su respaldo aquí. Los datos y el Word no se borran.
            </p>
          ) : (
            <p style={{ color: theme.textSecondary }}>
              Todavía no se guardan los PDF: falta configurar el almacenamiento (Backblaze B2) en Railway. Mientras tanto, al editar un expediente se vuelven a subir.
            </p>
          )}
        </div>
      </div>
      {info.configurado && (pr.archivos > 0 ? (
        <div className="panel-pdfs-aviso" style={{ backgroundColor: isDarkMode ? '#422006' : '#fffbeb', color: isDarkMode ? '#fcd34d' : '#92400e', borderColor: isDarkMode ? '#a16207' : '#fcd34d' }}>
          <CalendarClock size={18} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <strong>{pr.archivos} PDF de {pr.expedientes} expediente(s)</strong> ({tamano(pr.bytes)}) cumplen su plazo
            {pr.primera_fecha ? ` a partir del ${fechaLarga(pr.primera_fecha)}` : ''}. Descarga su respaldo para que se puedan borrar.
          </span>
          <button type="button" className="boton-barra" onClick={descargar} disabled={bajando} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
            {bajando ? <Loader2 size={14} className="girando" /> : <Download size={14} />} Descargar respaldo de PDF
          </button>
        </div>
      ) : (
        <div className="panel-respaldos-estado" style={{ backgroundColor: isDarkMode ? '#052e16' : '#ecfdf5', color: isDarkMode ? '#86efac' : '#065f46', borderColor: isDarkMode ? '#166534' : '#a7f3d0' }}>
          <CalendarClock size={16} />
          {info.por_borrar?.archivos
            ? `${info.por_borrar.archivos} PDF ya respaldados se borrarán en la siguiente revisión diaria.`
            : 'No hay PDF por respaldar en los próximos 30 días.'}
        </div>
      ))}
    </section>
  );
}

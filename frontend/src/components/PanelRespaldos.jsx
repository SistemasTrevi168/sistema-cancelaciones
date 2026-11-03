import { useCallback, useEffect, useState } from 'react';
import { Archive, CalendarClock, ChevronLeft, ChevronRight, Download, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar } from '../ui/notificaciones';

const fechaHora = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};
const tamano = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);

// Respaldos de toda la información (solo admin). El sistema hace uno solo cada día.
export default function PanelRespaldos() {
  const { theme, isDarkMode } = useApp();
  const [lista, setLista] = useState(null);
  const [creando, setCreando] = useState(false);
  const [bajando, setBajando] = useState(null);
  // 5 respaldos por página
  const POR_PAGINA = 5;
  const [pagina, setPagina] = useState(1);

  const cargar = useCallback(async () => {
    try {
      setLista((await api.get('/admin/respaldos')).data.respaldos || []);
    } catch {
      setLista([]);
    }
  }, []);
  useEffect(() => {
    let vivo = true;
    api.get('/admin/respaldos')
      .then((r) => { if (vivo) setLista(r.data.respaldos || []); })
      .catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, []);

  const crear = async () => {
    setCreando(true);
    try {
      await api.post('/admin/respaldos');
      await cargar();
      avisar.exito('Respaldo creado. Descárgalo para guardar una copia fuera del servidor.');
    } catch (e) {
      avisar.error(`No se pudo crear el respaldo: ${e.response?.data?.detail || e.message}`);
    } finally {
      setCreando(false);
    }
  };
  const descargar = async (r) => {
    setBajando(r.id);
    try {
      const res = await api.get(`/admin/respaldos/${r.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const a = document.createElement('a');
      const f = new Date(r.creado_en);
      a.href = url;
      a.download = `Respaldo_Cancelaciones_${Number.isNaN(f.getTime()) ? r.id : f.toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      avisar.error('No se pudo descargar el respaldo.');
    } finally {
      setBajando(null);
    }
  };

  const ultimo = lista?.find((r) => r.automatico);
  const total = lista?.length || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const enPagina = (lista || []).slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  return (
    <section className="panel-respaldos" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
      <div className="panel-respaldos-encabezado">
        <span className="panel-respaldos-icono" style={{ backgroundColor: `${theme.accent}1a`, color: theme.accent }}><ShieldCheck size={20} /></span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>Respaldos</h2>
          <p style={{ color: theme.textSecondary }}>
            Copia de toda la información: usuarios, expedientes, historial de cambios y plantillas. El sistema hace uno <strong>automático cada día</strong> y guarda los últimos 7.
            Descarga uno de vez en cuando y guárdalo en otro lugar (tu computadora, Drive…).
          </p>
        </div>
        <button type="button" className="boton-barra" onClick={crear} disabled={creando} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
          {creando ? <Loader2 size={15} className="girando" /> : <Plus size={15} />} Crear respaldo ahora
        </button>
      </div>

      <div className="panel-respaldos-estado" style={{ backgroundColor: isDarkMode ? '#052e16' : '#ecfdf5', color: isDarkMode ? '#86efac' : '#065f46', borderColor: isDarkMode ? '#166534' : '#a7f3d0' }}>
        <CalendarClock size={16} />
        {lista === null ? 'Revisando…' : ultimo ? `Último respaldo automático: ${fechaHora(ultimo.creado_en)}` : 'El primer respaldo automático se hará en unos minutos.'}
      </div>

      {lista === null ? (
        <div className="esqueleto" style={{ height: 44, borderRadius: 8 }} />
      ) : lista.length === 0 ? (
        <p style={{ color: theme.textSecondary, fontSize: 13, margin: '8px 0 0' }}>Todavía no hay respaldos.</p>
      ) : (
        <ul className="panel-respaldos-lista">
          {enPagina.map((r, i) => (
            <li key={r.id} style={{ borderColor: theme.border, animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <Archive size={18} color={theme.textSecondary} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{fechaHora(r.creado_en)}</strong>
                <small style={{ color: theme.textSecondary }}>{r.automatico ? 'Automático' : `Hecho por ${r.creado_por || 'admin'}`} · {tamano(r.tamano)}</small>
              </div>
              <button type="button" className="boton-barra" onClick={() => descargar(r)} disabled={bajando === r.id} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                {bajando === r.id ? <Loader2 size={14} className="girando" /> : <Download size={14} color={theme.accent} />} Descargar
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > POR_PAGINA && (
        <nav className="paginacion-lote" aria-label="Páginas de respaldos" style={{ borderColor: theme.border, color: theme.textSecondary, marginTop: 8 }}>
          <span>{(paginaVista - 1) * POR_PAGINA + 1}–{Math.min(paginaVista * POR_PAGINA, total)} de {total} respaldos</span>
          <div className="paginacion-botones">
            <button type="button" onClick={() => setPagina(paginaVista - 1)} disabled={paginaVista === 1} aria-label="Página anterior" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronLeft size={15} /></button>
            {Array.from({ length: totalPaginas }, (_, k) => k + 1).map((n) => (
              <button key={n} type="button" onClick={() => setPagina(n)} aria-current={n === paginaVista ? 'page' : undefined}
                style={{ borderColor: n === paginaVista ? theme.accent : theme.border, backgroundColor: n === paginaVista ? theme.accent : theme.cardBg, color: n === paginaVista ? '#fff' : theme.textPrimary }}>{n}</button>
            ))}
            <button type="button" onClick={() => setPagina(paginaVista + 1)} disabled={paginaVista === totalPaginas} aria-label="Página siguiente" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronRight size={15} /></button>
          </div>
        </nav>
      )}
    </section>
  );
}

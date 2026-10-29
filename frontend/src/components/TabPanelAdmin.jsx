import { useEffect, useState } from 'react';
import {
  CalendarDays, CheckCircle2, Clock, FileCheck2, LayoutDashboard, Loader2, PackageCheck, RefreshCw, ShieldAlert, Users, Wifi,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { escuchar } from '../ui/eventosTiempoReal';
import Avatar from './Avatar';

// Panel de inicio del administrador: cuántos se hicieron hoy y esta semana, cuántos con incidencia,
// cuántos falta entregar y quién va más cargado. Se actualiza solo.
const ROL = { admin: 'Administrador', operador: 'Operador', revisor: 'Revisor' };
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const hace = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

export default function TabPanelAdmin() {
  const { theme, isDarkMode, cambiarPestana } = useApp();
  const [panel, setPanel] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [todas, setTodas] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get('/admin/panel')
      .then((r) => { if (vivo) { setPanel(r.data); setError(''); } })
      .catch((err) => { if (vivo) setError(err.response?.status === 404 ? 'Falta subir la actualización del servidor para ver el panel.' : 'No se pudo cargar el panel.'); });
    return () => { vivo = false; };
  }, [version]);
  // Se actualiza cada minuto y cuando alguien entra o sale del sistema
  useEffect(() => {
    const t = setInterval(() => setVersion((v) => v + 1), 60000);
    let espera = null;
    const quitar = escuchar('sesiones', () => { clearTimeout(espera); espera = setTimeout(() => setVersion((v) => v + 1), 800); });
    return () => { clearInterval(t); clearTimeout(espera); quitar(); };
  }, []);

  const t = panel?.totales || {};
  const total = t.total || 0;
  const porEntregar = (t.GENERADO || 0) + (t.REVISADO || 0);
  const dias = panel?.ultimos_14_dias || [];
  const maxDia = Math.max(1, ...dias.map((d) => d.total));
  const personas = panel?.personas || [];
  const maxPendientes = Math.max(1, ...personas.map((p) => p.pendientes));
  const tarjeta = { backgroundColor: theme.cardBg, borderColor: theme.border };
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  const cifras = [
    ['Hoy', t.hoy, CalendarDays, theme.accent],
    ['Esta semana', t.semana, CalendarDays, theme.accent],
    ['Este mes', t.mes, CalendarDays, theme.accent],
    ['Por entregar', porEntregar, Clock, '#d97706'],
    ['Con incidencia', t.incidencias, ShieldAlert, '#dc2626'],
    ['Entregados', t.ENTREGADO, PackageCheck, '#059669'],
  ];
  const estados = [
    ['Generado', t.GENERADO || 0, FileCheck2, isDarkMode ? '#a5b4fc' : '#4338ca'],
    ['Revisado', t.REVISADO || 0, CheckCircle2, isDarkMode ? '#fcd34d' : '#b45309'],
    ['Entregado', t.ENTREGADO || 0, PackageCheck, isDarkMode ? '#6ee7b7' : '#047857'],
  ];

  return (
    <div className="panel-admin">
      <div className="rc-encabezado">
        <div>
          <h2 style={{ color: theme.textPrimary }}><LayoutDashboard size={20} color={theme.accent} /> Panel de inicio</h2>
          <p style={{ color: theme.textSecondary }}>Cómo va el trabajo de todo el equipo. Se actualiza solo.</p>
        </div>
        <button type="button" className="rc-accion rc-actualizar" onClick={() => setVersion((v) => v + 1)} title="Actualizar" aria-label="Actualizar" style={{ color: theme.textSecondary, borderColor: theme.border }}>
          <RefreshCw size={15} className={!panel && !error ? 'girando' : ''} />
        </button>
      </div>

      {error && <div className="perfil-ajeno-error" style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}>{error}</div>}
      {!panel && !error && <div className="bitacora-cargando" style={{ color: theme.textSecondary, padding: '30px' }}><Loader2 size={18} className="girando" /> Cargando…</div>}

      {panel && (
        <>
          <div className="pa-cifras">
            {cifras.map(([titulo, valor, I, color]) => (
              <div key={titulo} className="pa-cifra" style={tarjeta}>
                <span className="pa-cifra-icono" style={{ backgroundColor: `${color}17`, color }}><I size={17} /></span>
                <strong style={{ color: theme.textPrimary }}>{valor ?? 0}</strong>
                <small style={{ color: theme.textSecondary }}>{titulo}</small>
              </div>
            ))}
          </div>

          <div className="pa-fila">
            <section className="pa-caja" style={tarjeta}>
              <h3 style={{ color: theme.textPrimary }}>Últimos 14 días</h3>
              <div className="pa-barras" aria-label="Expedientes por día">
                {dias.map((d) => {
                  const f = new Date(`${d.fecha}T12:00:00`);
                  const esHoy = d === dias[dias.length - 1];
                  return (
                    <div key={d.fecha} className="pa-barra" title={`${f.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })}: ${d.total}`}>
                      <span className="pa-barra-n" style={{ color: theme.textSecondary }}>{d.total || ''}</span>
                      <div style={{ height: `${Math.max(3, (d.total / maxDia) * 100)}%`, backgroundColor: esHoy ? theme.accent : `${theme.accent}88` }} />
                      <small style={{ color: esHoy ? theme.textPrimary : theme.textSecondary, fontWeight: esHoy ? 800 : 500 }}>{DIAS[f.getDay()]}</small>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="pa-caja" style={tarjeta}>
              <h3 style={{ color: theme.textPrimary }}>Estado de {total} expedientes</h3>
              <div className="pa-estados">
                {estados.map(([n, v, I, color]) => (
                  <div key={n} className="pa-estado">
                    <span className="pa-estado-nombre" style={{ color }}><I size={14} /> {n}</span>
                    <div className="pa-estado-barra" style={{ backgroundColor: theme.subtleBg }}><div style={{ width: `${pct(v)}%`, backgroundColor: color }} /></div>
                    <span className="pa-estado-n" style={{ color: theme.textPrimary }}>{v} <small style={{ color: theme.textSecondary }}>{pct(v)}%</small></span>
                  </div>
                ))}
              </div>
              <div className="pa-conectados" style={{ borderColor: theme.border }}>
                <span style={{ color: theme.textSecondary }}><Wifi size={13} color="#16a34a" /> En línea ahora ({panel.conectados?.length || 0})</span>
                <div>
                  {(panel.conectados || []).map((c) => (
                    <span key={c.usuario} className="pa-chip" style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary }}><i /> {c.nombre}</span>
                  ))}
                  {!panel.conectados?.length && <small style={{ color: theme.textSecondary }}>Nadie por ahora</small>}
                </div>
              </div>
            </section>
          </div>

          <section className="pa-caja" style={tarjeta}>
            <h3 style={{ color: theme.textPrimary }}><Users size={16} color={theme.accent} /> Quién va más cargado</h3>
            <p className="pa-nota" style={{ color: theme.textSecondary }}>Ordenado por expedientes pendientes de entregar (Generados + Revisados).</p>
            <div className={`pa-tabla ${todas ? 'pa-tabla-scroll' : ''}`}>
              <div className="pa-tabla-cabeza" style={{ color: theme.textSecondary, borderColor: theme.border }}>
                <span>Persona</span><span>Pendientes</span><span>Hoy</span><span>Semana</span><span>Incidencias</span><span>Entregados</span><span>Total</span><span>Último</span>
              </div>
              {(todas ? personas : personas.slice(0, 10)).map((p) => (
                <div key={p.usuario} className="pa-tabla-fila" style={{ borderColor: theme.border }}>
                  <span className="pa-persona">
                    <Avatar usuario={{ username: p.usuario, nombre_mostrar: p.nombre, foto: p.foto }} tam={30} color={theme.accent} />
                    <span><strong style={{ color: theme.textPrimary }}>{p.nombre}</strong><small style={{ color: theme.textSecondary }}>{ROL[p.rol] || p.rol}{p.activo ? '' : ' · inactivo'}</small></span>
                  </span>
                  <span className="pa-pendientes" data-etiqueta="Pendientes">
                    <b style={{ color: theme.textPrimary }}>{p.pendientes}</b>
                    <span className="pa-carga" style={{ backgroundColor: theme.subtleBg }}><i style={{ width: `${(p.pendientes / maxPendientes) * 100}%`, backgroundColor: p.pendientes / maxPendientes > 0.66 ? '#dc2626' : p.pendientes / maxPendientes > 0.33 ? '#d97706' : '#16a34a' }} /></span>
                  </span>
                  <span data-etiqueta="Hoy" style={{ color: theme.textPrimary }}>{p.hoy}</span>
                  <span data-etiqueta="Semana" style={{ color: theme.textPrimary }}>{p.semana}</span>
                  <span data-etiqueta="Incidencias" style={{ color: p.incidencias ? '#dc2626' : theme.textSecondary, fontWeight: p.incidencias ? 700 : 400 }}>{p.incidencias}</span>
                  <span data-etiqueta="Entregados" style={{ color: theme.textPrimary }}>{p.ENTREGADO}</span>
                  <span data-etiqueta="Total" style={{ color: theme.textPrimary }}>{p.total}</span>
                  <span data-etiqueta="Último" style={{ color: theme.textSecondary }}>{hace(p.ultimo)}</span>
                </div>
              ))}
              {personas.length === 0 && <p className="pa-nota" style={{ color: theme.textSecondary }}>Todavía no hay expedientes.</p>}
              {personas.length > 10 && (
                <button type="button" className="enlace-pequeno pa-ir" onClick={() => setTodas((v) => !v)} style={{ color: theme.accent }}>
                  {todas ? 'Ver solo las 10 más cargadas' : `Ver las ${personas.length} personas`}
                </button>
              )}
            </div>
            <button type="button" className="enlace-pequeno pa-ir" onClick={() => cambiarPestana('kpis')} style={{ color: theme.accent }}>Ver el reporte detallado por persona →</button>
          </section>
        </>
      )}
    </div>
  );
}

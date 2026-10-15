import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, CalendarDays, Clock, Download, FileText, Loader2, PenLine, RefreshCw, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar } from '../ui/notificaciones';
import { nombrePlantilla } from '../plantillasCatalogo';

// ---------- Fechas ----------
const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}`; };
const fechaLarga = (iso) => { const [a, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`; };

const PERIODOS = [
  { id: 'hoy', nombre: 'Hoy' },
  { id: '7', nombre: '7 días' },
  { id: '30', nombre: '30 días' },
  { id: 'mes', nombre: 'Este mes' },
  { id: 'mes_ant', nombre: 'Mes anterior' },
  { id: 'otro', nombre: 'Elegir fechas' },
];

function rangoDe(periodo) {
  const hoy = new Date();
  const menos = (n) => { const d = new Date(hoy); d.setDate(d.getDate() - n); return d; };
  switch (periodo) {
    case 'hoy': return [aISO(hoy), aISO(hoy)];
    case '7': return [aISO(menos(6)), aISO(hoy)];
    case 'mes': return [aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), aISO(hoy)];
    case 'mes_ant': return [aISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 0))];
    default: return [aISO(menos(29)), aISO(hoy)];
  }
}

const duracion = (seg) => {
  if (seg === null || seg === undefined) return '—';
  if (seg < 60) return `${seg} s`;
  const m = Math.floor(seg / 60);
  return m < 60 ? `${m} min ${String(seg % 60).padStart(2, '0')} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

// ---------- Gráfica de columnas (con tooltip al pasar el mouse) ----------
function Columnas({ datos, alto = 180, etiquetaCada = 1, theme }) {
  const [activo, setActivo] = useState(null);
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const paso = max <= 4 ? 1 : Math.ceil(max / 4);
  const tope = paso * Math.ceil(max / paso);
  const lineas = [];
  for (let v = 0; v <= tope; v += paso) lineas.push(v);
  return (
    <div className="kpi-columnas" style={{ '--alto': `${alto}px` }} onMouseLeave={() => setActivo(null)}>
      <div className="kpi-eje-y" style={{ color: theme.textSecondary }}>
        {[...lineas].reverse().map((v) => <span key={v}>{v}</span>)}
      </div>
      <div className="kpi-area">
        {lineas.map((v) => (
          <div key={v} className="kpi-linea" style={{ bottom: `${(v / tope) * 100}%`, borderColor: theme.border }} />
        ))}
        <div className="kpi-barras">
          {datos.map((d, i) => (
            <div
              key={d.clave}
              className={`kpi-col ${activo === i ? 'activa' : ''}`}
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              tabIndex={0}
              aria-label={`${d.etiqueta}: ${d.valor}`}
            >
              <div className="kpi-barra" style={{ height: d.valor ? `max(3px, ${(d.valor / tope) * 100}%)` : 0, backgroundColor: theme.accent }} />
              {activo === i && (
                <div className={`kpi-tooltip ${i > datos.length * 0.7 ? 'izq' : ''}`} style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
                  <strong>{d.titulo || d.etiqueta}</strong>
                  <div>{d.valor} expediente{d.valor === 1 ? '' : 's'}</div>
                  {d.detalle && d.detalle.length > 0 && (
                    <ul>{d.detalle.map(([k, v]) => <li key={k} style={{ color: theme.textSecondary }}>{k}: <b style={{ color: theme.textPrimary }}>{v}</b></li>)}</ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="kpi-eje-x" style={{ color: theme.textSecondary }}>
          {datos.map((d, i) => <span key={d.clave}>{i % etiquetaCada === 0 ? d.etiqueta : ''}</span>)}
        </div>
      </div>
    </div>
  );
}

// ---------- Barras horizontales (rankings) ----------
function Ranking({ datos, theme, vacio }) {
  if (!datos.length) return <p className="kpi-vacio" style={{ color: theme.textSecondary }}>{vacio}</p>;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <ul className="kpi-ranking">
      {datos.map((d) => (
        <li key={d.clave} title={`${d.etiqueta}: ${d.valor}`}>
          <span className="kpi-ranking-nombre" style={{ color: theme.textSecondary }}>{d.etiqueta}</span>
          <span className="kpi-ranking-pista" style={{ backgroundColor: theme.subtleBg }}>
            <span style={{ width: `${(d.valor / max) * 100}%`, backgroundColor: theme.accent }} />
          </span>
          <span className="kpi-ranking-valor" style={{ color: theme.textPrimary }}>{d.valor}</span>
        </li>
      ))}
    </ul>
  );
}

function Tarjeta({ titulo, children, theme, accion }) {
  return (
    <section className="kpi-tarjeta" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
      <header>
        <h3 style={{ color: theme.textPrimary }}>{titulo}</h3>
        {accion}
      </header>
      {children}
    </section>
  );
}

function Indicador({ icono: Icono, titulo, valor, nota, theme, tendencia }) {
  return (
    <div className="kpi-indicador" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
      <div className="kpi-indicador-titulo" style={{ color: theme.textSecondary }}><Icono size={15} color={theme.accent} /> {titulo}</div>
      <div className="kpi-indicador-valor" style={{ color: theme.textPrimary }}>{valor}</div>
      {nota && (
        <div className="kpi-indicador-nota" style={{ color: tendencia === 'sube' ? '#15803d' : tendencia === 'baja' ? '#b91c1c' : theme.textSecondary }}>
          {tendencia === 'sube' && <TrendingUp size={13} />}{tendencia === 'baja' && <TrendingDown size={13} />} {nota}
        </div>
      )}
    </div>
  );
}

const COLUMNAS = [
  { id: 'usuario', nombre: 'Operador', texto: true },
  { id: 'expedientes', nombre: 'Expedientes' },
  { id: 'promedio_por_dia', nombre: 'Prom. por día' },
  { id: 'dias_activos', nombre: 'Días activos' },
  { id: 'hora_inicio_prom', nombre: 'Horario prom.', texto: true },
  { id: 'hora_pico', nombre: 'Hora pico', texto: true },
  { id: 'revision_mediana_seg', nombre: 'Revisión típica' },
  { id: 'pct_con_correcciones', nombre: '% corregidos a mano' },
  { id: 'con_avisos', nombre: 'Con avisos' },
  { id: 'pct_guardados', nombre: 'Leídos → guardados' },
  { id: 'words', nombre: 'Word / ZIP' },
  { id: 'sesiones', nombre: 'Sesiones' },
  { id: 'ultima_actividad', nombre: 'Última actividad', texto: true },
];

export default function TabKpis() {
  const { theme, etiquetaCampo } = useApp();
  const [periodo, setPeriodo] = useState('30');
  const [rango, setRango] = useState(() => rangoDe('30'));
  const [usuario, setUsuario] = useState('');
  const [angosto, setAngosto] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const cambio = (e) => setAngosto(e.matches);
    mq.addEventListener('change', cambio);
    return () => mq.removeEventListener('change', cambio);
  }, []);
  const [version, setVersion] = useState(0); // para el botón de actualizar
  const [respuesta, setRespuesta] = useState({ clave: null, datos: null });
  const [descargando, setDescargando] = useState(false);
  const [orden, setOrden] = useState({ col: 'expedientes', desc: true });

  const params = useMemo(() => ({ desde: rango[0], hasta: rango[1], ...(usuario ? { usuario } : {}) }), [rango, usuario]);
  const clave = `${JSON.stringify(params)}#${version}`;
  const datos = respuesta.datos;
  const cargando = respuesta.clave !== clave;
  const cargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    let vigente = true;
    api.get('/admin/kpis', { params })
      .then((res) => { if (vigente) setRespuesta({ clave, datos: res.data }); })
      .catch((err) => {
        if (!vigente) return;
        avisar.error(`No se pudieron cargar los KPIs: ${err.response?.data?.detail || err.message}`);
        setRespuesta((r) => ({ ...r, clave }));
      });
    return () => { vigente = false; };
  }, [clave, params]);

  const elegirPeriodo = (id) => {
    setPeriodo(id);
    if (id !== 'otro') setRango(rangoDe(id));
  };

  const descargarExcel = async () => {
    setDescargando(true);
    try {
      const res = await api.get('/admin/kpis/excel', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `KPIs_${rango[0]}_a_${rango[1]}${usuario ? `_${usuario}` : ''}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      avisar.error('No se pudo descargar el reporte de Excel.');
    } finally {
      setDescargando(false);
    }
  };

  const filas = useMemo(() => {
    const lista = [...(datos?.por_usuario || [])];
    const { col, desc } = orden;
    lista.sort((a, b) => {
      const x = a[col] ?? -1; const y = b[col] ?? -1;
      const r = typeof x === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return desc ? -r : r;
    });
    return lista;
  }, [datos, orden]);

  const r = datos?.resumen;
  const dias = datos?.por_dia || [];
  const cambio = r?.cambio_pct;

  return (
    <div className="kpis">
      <div className="carga-encabezado">
        <h2 style={{ color: theme.textPrimary }}><BarChart3 size={20} color={theme.accent} /> Rendimiento de operadores</h2>
        <p style={{ color: theme.textSecondary }}>Cuántos expedientes genera cada usuario, a qué hora trabaja, cuánto tarda en revisar y qué corrige a mano. Haz clic en un operador para ver solo sus datos.</p>
      </div>

      {/* Filtros: una sola fila arriba de todo */}
      <div className="kpi-filtros" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
        <div className="kpi-periodos" role="group" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={periodo === p.id ? 'activo' : ''}
              onClick={() => elegirPeriodo(p.id)}
              style={periodo === p.id ? { backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent } : { backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}
            >
              {p.nombre}
            </button>
          ))}
        </div>
        {periodo === 'otro' && (
          <div className="kpi-fechas">
            <input id="kpi-desde" type="date" value={rango[0]} max={rango[1]} onChange={(e) => e.target.value && setRango([e.target.value, rango[1]])} style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }} />
            <span style={{ color: theme.textSecondary }}>a</span>
            <input id="kpi-hasta" type="date" value={rango[1]} min={rango[0]} onChange={(e) => e.target.value && setRango([rango[0], e.target.value])} style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }} />
          </div>
        )}
        <select id="kpi-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} className="selector-plantilla" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary, width: 'auto', minWidth: '180px' }}>
          <option value="">Todos los usuarios</option>
          {(datos?.usuarios || []).map((u) => <option key={u.username} value={u.username}>{u.username}{u.activo === false ? ' (desactivado)' : ''}</option>)}
        </select>
        <div className="kpi-filtros-acciones">
          <button type="button" className="boton-barra" onClick={cargar} disabled={cargando} title="Actualizar" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
            <RefreshCw size={14} className={cargando ? 'girando' : ''} />
          </button>
          <button type="button" className="boton-barra" onClick={descargarExcel} disabled={descargando || !datos} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
            {descargando ? <Loader2 size={14} className="girando" /> : <Download size={14} color="#15803d" />} Descargar Excel
          </button>
        </div>
      </div>

      {!datos && cargando && (
        <div className="kpi-cargando" style={{ color: theme.textSecondary }}><Loader2 size={18} className="girando" /> Cargando indicadores…</div>
      )}

      {datos && (
        <div className={`kpi-contenido ${cargando ? 'actualizando' : ''}`}>
          <p className="kpi-periodo-texto" style={{ color: theme.textSecondary }}>
            {datos.desde === datos.hasta ? fechaLarga(datos.desde) : `${fechaLarga(datos.desde)} – ${fechaLarga(datos.hasta)}`}
            {usuario ? <> · <strong style={{ color: theme.textPrimary }}>{usuario}</strong> <button type="button" className="enlace-pequeno" onClick={() => setUsuario('')}>ver todos</button></> : ' · todos los usuarios'}
          </p>

          <div className="kpi-indicadores">
            <Indicador
              icono={FileText} titulo="Expedientes" valor={r.expedientes} theme={theme}
              nota={cambio === null || cambio === undefined ? `Periodo anterior: ${r.expedientes_periodo_anterior}` : `${cambio > 0 ? '+' : ''}${cambio}% vs periodo anterior (${r.expedientes_periodo_anterior})`}
              tendencia={cambio > 0 ? 'sube' : cambio < 0 ? 'baja' : null}
            />
            <Indicador icono={CalendarDays} titulo="Promedio por día" valor={r.promedio_por_dia} theme={theme}
              nota={r.mejor_dia ? `Mejor día: ${fechaCorta(r.mejor_dia.fecha)} (${r.mejor_dia.total})` : 'Sin producción'} />
            <Indicador icono={Users} titulo="Operadores activos" valor={r.operadores_activos} theme={theme} nota={`${r.dias_con_produccion} día(s) con producción`} />
            <Indicador icono={Clock} titulo="Revisión típica" valor={duracion(r.revision_mediana_seg)} theme={theme} nota="De leer a guardar (mediana)" />
            <Indicador icono={PenLine} titulo="Corregidos a mano" valor={pct(r.pct_con_correcciones)} theme={theme} nota={`${r.con_avisos} guardado(s) con avisos`} />
            <Indicador icono={Download} titulo="Descargas" valor={`${r.words} / ${r.zips}`} theme={theme} nota="Word / ZIP" />
          </div>

          {!r.con_bitacora && (
            <p className="kpi-nota" style={{ color: theme.textSecondary, borderColor: theme.border, backgroundColor: theme.subtleBg }}>
              Los tiempos de revisión, las correcciones a mano, las sesiones y las descargas se empiezan a medir a partir de esta versión. La producción (expedientes por usuario, día y hora) sí incluye lo anterior.
            </p>
          )}

          <Tarjeta titulo="Producción por día" theme={theme}>
            <Columnas
              theme={theme}
              etiquetaCada={angosto ? Math.max(1, Math.ceil(dias.length / 4)) : (dias.length > 62 ? 14 : dias.length > 31 ? 7 : dias.length > 14 ? 3 : 1)}
              datos={dias.map((d) => ({
                clave: d.fecha,
                etiqueta: fechaCorta(d.fecha),
                titulo: fechaLarga(d.fecha),
                valor: d.total,
                detalle: usuario ? [] : Object.entries(d.por_usuario || {}).sort((a, b) => b[1] - a[1]),
              }))}
            />
          </Tarjeta>

          <div className="kpi-dos">
            <Tarjeta titulo="¿A qué hora se generan?" theme={theme}>
              <Columnas
                theme={theme} alto={150} etiquetaCada={angosto ? 6 : 3}
                datos={(datos.por_hora || []).map((h) => ({ clave: h.hora, etiqueta: `${h.hora}h`, titulo: `${String(h.hora).padStart(2, '0')}:00 – ${String(h.hora).padStart(2, '0')}:59`, valor: h.total }))}
              />
            </Tarjeta>
            <Tarjeta titulo="Por día de la semana" theme={theme}>
              <Columnas
                theme={theme} alto={150}
                datos={(datos.por_dia_semana || []).map((d) => ({ clave: d.dia, etiqueta: d.dia.slice(0, 3), titulo: d.dia, valor: d.total }))}
              />
            </Tarjeta>
          </div>

          <Tarjeta titulo="Por operador" theme={theme}>
            {filas.length === 0 ? (
              <p className="kpi-vacio" style={{ color: theme.textSecondary }}>No hay actividad en este periodo.</p>
            ) : (
              <div className="kpi-tabla-contenedor">
                <table className="kpi-tabla">
                  <thead>
                    <tr>
                      {COLUMNAS.map((c) => (
                        <th
                          key={c.id}
                          scope="col"
                          className={c.texto ? 'texto' : ''}
                          style={{ color: theme.textSecondary, borderColor: theme.border }}
                          aria-sort={orden.col === c.id ? (orden.desc ? 'descending' : 'ascending') : undefined}
                        >
                          <button type="button" onClick={() => setOrden((o) => ({ col: c.id, desc: o.col === c.id ? !o.desc : !c.texto }))} style={{ color: 'inherit' }}>
                            {c.nombre}{orden.col === c.id ? (orden.desc ? ' ↓' : ' ↑') : ''}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((u) => (
                      <tr key={u.usuario} onClick={() => setUsuario(u.usuario === usuario ? '' : u.usuario)} className={u.usuario === usuario ? 'elegida' : ''} title={u.usuario === usuario ? 'Ver todos' : `Ver solo a ${u.usuario}`} style={{ color: theme.textPrimary, borderColor: theme.border }}>
                        <td className="texto"><strong>{u.usuario}</strong>{u.plantilla_top && <small style={{ color: theme.textSecondary }}>{nombrePlantilla(u.plantilla_top) || u.plantilla_top}</small>}</td>
                        <td><strong>{u.expedientes}</strong></td>
                        <td>{u.promedio_por_dia}</td>
                        <td>{u.dias_activos}</td>
                        <td className="texto">{u.hora_inicio_prom ? `${u.hora_inicio_prom} – ${u.hora_fin_prom}` : '—'}{u.jornada_prom_horas ? <small style={{ color: theme.textSecondary }}>{u.jornada_prom_horas} h activas</small> : null}</td>
                        <td className="texto">{u.hora_pico || '—'}</td>
                        <td>{duracion(u.revision_mediana_seg)}</td>
                        <td>{pct(u.pct_con_correcciones)}{u.corregidos_prom ? <small style={{ color: theme.textSecondary }}>{u.corregidos_prom} campos prom.</small> : null}</td>
                        <td>{u.con_avisos}</td>
                        <td>{u.leidos ? `${pct(u.pct_guardados)}` : '—'}{u.leidos ? <small style={{ color: theme.textSecondary }}>{u.leidos} leídos</small> : null}</td>
                        <td>{u.words} / {u.zips}</td>
                        <td>{u.sesiones}</td>
                        <td className="texto">{u.ultima_actividad ? fechaCorta(u.ultima_actividad.slice(0, 10)) + ' ' + u.ultima_actividad.slice(11) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <div className="kpi-tres">
            <Tarjeta titulo="Plantillas más usadas" theme={theme}>
              <Ranking theme={theme} vacio="Sin expedientes." datos={(datos.plantillas || []).map((p) => ({ clave: p.plantilla, etiqueta: nombrePlantilla(p.plantilla) || p.plantilla, valor: p.total }))} />
            </Tarjeta>
            <Tarjeta titulo="Campos que más se corrigen a mano" theme={theme}>
              <Ranking theme={theme} vacio="Aún no hay correcciones registradas." datos={(datos.campos_corregidos || []).map((c) => ({ clave: c.campo, etiqueta: etiquetaCampo ? etiquetaCampo(c.campo) : c.campo, valor: c.veces }))} />
            </Tarjeta>
            <Tarjeta titulo="¿Cómo se generan?" theme={theme}>
              <Ranking theme={theme} vacio="Sin expedientes." datos={(datos.origenes || []).map((o) => ({ clave: o.origen, etiqueta: o.nombre, valor: o.total }))} />
            </Tarjeta>
          </div>
        </div>
      )}
    </div>
  );
}

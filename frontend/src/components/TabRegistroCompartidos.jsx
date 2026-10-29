import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronLeft, FileArchive, ChevronRight, FolderOpen, ListChecks, Loader2, RefreshCw, Search, Share2, UserMinus, Users, X,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import { colorEstado, infoEstado } from '../estadosExpediente';
import Avatar from './Avatar';
import Selector from './Selector';

// «Expedientes compartidos» (solo administradores): qué se compartió, de quién es, quién lo compartió,
// con quién y cuándo. Se ve agrupado por persona (con quién) o por expediente; desde aquí se vuelve a compartir o se quita el acceso.
const POR_PAGINA = 10;
const ROL = { admin: 'Administrador', operador: 'Operador', revisor: 'Revisor' };
const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cuando = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function TabRegistroCompartidos() {
  const { theme, isDarkMode, currentUser, abrirCompartir, descargarZipIds, descargandoZipIds } = useApp();
  const [filas, setFilas] = useState(null);
  const [version, setVersion] = useState(0);
  const [vista, setVista] = useState('persona'); // persona / expediente
  const [busca, setBusca] = useState('');
  const [quienCompartio, setQuienCompartio] = useState('');
  const [abiertos, setAbiertos] = useState({});
  const [pagina, setPagina] = useState(1);
  const [marcados, setMarcados] = useState({}); // expediente_id -> true
  const [quitando, setQuitando] = useState(null);
  const recargar = () => setVersion((v) => v + 1);
  const yo = currentUser?.username;

  useEffect(() => {
    let vivo = true;
    api.get('/compartir/registro')
      .then((r) => { if (vivo) setFilas(r.data || []); })
      .catch((err) => {
        if (!vivo) return;
        setFilas([]);
        avisar.error(err.response?.status === 404 ? 'Falta subir la actualización del servidor para ver esto.' : 'No se pudo cargar lo compartido.');
      });
    return () => { vivo = false; };
  }, [version]);

  const lista = useMemo(() => filas || [], [filas]);
  const compartieron = useMemo(() => [...new Map(lista.map((f) => [f.compartio, f.compartio_nombre])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [lista]);
  const coincide = (f) => {
    if (quienCompartio && f.compartio !== quienCompartio) return false;
    if (!busca.trim()) return true;
    const q = normal(busca.trim());
    return [f.acreditado, f.numero_credito, f.con_nombre, f.con_usuario, f.compartio_nombre, f.propietario_nombre]
      .some((t) => normal(t).includes(q));
  };
  const visibles = lista.filter(coincide);

  // Grupos: por persona (con quién) o por expediente
  const grupos = useMemo(() => {
    const m = new Map();
    visibles.forEach((f) => {
      const clave = vista === 'persona' ? f.con_usuario : (f.expediente_id || `todos:${f.propietario}`);
      if (!m.has(clave)) m.set(clave, { clave, filas: [], ultimo: '' });
      const g = m.get(clave);
      g.filas.push(f);
      if ((f.creado_en || '') > g.ultimo) g.ultimo = f.creado_en || '';
    });
    return [...m.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busca, quienCompartio, vista]);

  const clave = JSON.stringify([busca, quienCompartio, vista]);
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) { setClaveAnterior(clave); setPagina(1); }
  const totalPaginas = Math.max(1, Math.ceil(grupos.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalPaginas);
  const gruposPagina = grupos.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  // Al buscar se abren los grupos para ver qué coincide
  const estaAbierto = (g) => (g.clave in abiertos ? abiertos[g.clave] : !!busca.trim());

  const expedientesIds = new Set(lista.filter((f) => f.expediente_id).map((f) => f.expediente_id));
  const marcadosIds = Object.keys(marcados).filter((i) => marcados[i] && expedientesIds.has(i));
  // Marcar varios a la vez: todos los que se ven (con la búsqueda y filtros actuales) o los de una persona
  const idsVisibles = [...new Set(visibles.filter((f) => f.expediente_id).map((f) => f.expediente_id))];
  const estadoMarca = (ids) => {
    const n = ids.filter((i) => marcados[i]).length;
    return { todos: ids.length > 0 && n === ids.length, parcial: n > 0 && n < ids.length };
  };
  const alternarVarios = (ids) => {
    const { todos } = estadoMarca(ids);
    setMarcados((m) => {
      const nuevo = { ...m };
      ids.forEach((i) => { if (todos) delete nuevo[i]; else nuevo[i] = true; });
      return nuevo;
    });
  };
  const casillaVarias = (ids, etiqueta) => {
    const { todos, parcial } = estadoMarca(ids);
    return (
      <input type="checkbox" aria-label={etiqueta} title={etiqueta} checked={todos}
        ref={(el) => { if (el) el.indeterminate = parcial; }}
        onChange={() => alternarVarios(ids)} />
    );
  };
  const personas = new Set(lista.map((f) => f.con_usuario));

  const compartirOtraVez = (ids, titulo) => abrirCompartir({ ids, titulo, onListo: () => { setMarcados({}); recargar(); } });
  const quitarAcceso = async (f) => {
    const que = f.todos ? `todos los expedientes de ${f.propietario_nombre}` : `el expediente de ${f.acreditado || f.numero_credito}`;
    if (!(await confirmar(`${f.con_nombre} ya no podrá ver ${que}. Le llegará un aviso.`, { titulo: 'Quitar acceso', textoConfirmar: 'Quitar acceso', peligro: true }))) return;
    setQuitando(f.id);
    try {
      await api.post('/compartir/quitar', f.todos
        ? { todos: true, propietario: f.propietario, usuarios: [f.con_usuario] }
        : { ids: [f.expediente_id], usuarios: [f.con_usuario] });
      avisar.exito(`Se quitó el acceso a ${f.con_nombre}.`);
      recargar();
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo quitar el acceso.');
    } finally {
      setQuitando(null);
    }
  };

  const botonQuitar = (f) => (
    <button type="button" className="rc-accion" title={`Quitar el acceso a ${f.con_nombre}`} aria-label="Quitar acceso"
      onClick={() => quitarAcceso(f)} disabled={quitando === f.id} style={{ color: '#dc2626' }}>
      {quitando === f.id ? <Loader2 size={14} className="girando" /> : <UserMinus size={14} />}
    </button>
  );
  const estado = (f) => {
    if (!f.estado) return null;
    const e = infoEstado(f.estado);
    const I = e.icono;
    return <span className="rc-estado" style={colorEstado(f.estado, isDarkMode)}><I size={10} /> {e.nombre}</span>;
  };
  const casilla = (id, nombre) => (id ? (
    <input type="checkbox" aria-label={`Marcar ${nombre}`} checked={!!marcados[id]}
      onChange={() => setMarcados((m) => ({ ...m, [id]: !m[id] }))} />
  ) : <span className="rc-casilla-vacia" />);

  // ---- Cabecera de cada grupo ----
  const cabecera = (g) => {
    const f0 = g.filas[0];
    const ids = [...new Set(g.filas.filter((f) => f.expediente_id).map((f) => f.expediente_id))];
    if (vista === 'persona') {
      const todos = g.filas.filter((f) => f.todos);
      return (
        <>
          <Avatar usuario={{ username: f0.con_usuario, nombre_mostrar: f0.con_nombre }} tam={34} color={theme.accent} />
          <span className="rc-titulo">
            <strong style={{ color: theme.textPrimary }}>{f0.con_nombre}{f0.con_activo ? '' : ' (inactivo)'}</strong>
            <small style={{ color: theme.textSecondary }}>{ROL[f0.con_rol] || f0.con_rol} · último {cuando(g.ultimo)}</small>
          </span>
          <span className="rc-resumen">
            {ids.length > 0 && <span className="rc-pastilla" style={{ backgroundColor: `${theme.accent}14`, color: theme.accent }}>{ids.length} expediente{ids.length === 1 ? '' : 's'}</span>}
            {todos.length > 0 && <span className="rc-pastilla" style={{ backgroundColor: isDarkMode ? '#422006' : '#fef3c7', color: isDarkMode ? '#fcd34d' : '#92400e' }}><Users size={11} /> Todos de {todos.map((t) => t.propietario_nombre).join(', ')}</span>}
          </span>
        </>
      );
    }
    if (f0.todos) {
      return (
        <>
          <span className="rc-icono" style={{ backgroundColor: `${theme.accent}14`, color: theme.accent }}><Users size={16} /></span>
          <span className="rc-titulo">
            <strong style={{ color: theme.textPrimary }}>Todos los expedientes de {f0.propietario_nombre}</strong>
            <small style={{ color: theme.textSecondary }}>Incluye los que haga después</small>
          </span>
          <span className="rc-resumen"><span className="rc-pastilla" style={{ backgroundColor: `${theme.accent}14`, color: theme.accent }}>{g.filas.length} persona{g.filas.length === 1 ? '' : 's'}</span></span>
        </>
      );
    }
    return (
      <>
        <span onClick={(e) => e.stopPropagation()} className="rc-casilla">{casilla(f0.expediente_id, f0.acreditado)}</span>
        <span className="rc-titulo">
          <strong style={{ color: theme.textPrimary }}>{f0.acreditado || 'Sin nombre'}</strong>
          <small style={{ color: theme.textSecondary }}>Crédito {f0.numero_credito} · de {f0.propietario_nombre} {estado(f0)}</small>
        </span>
        <span className="rc-resumen rc-avatares" title={g.filas.map((f) => f.con_nombre).join(', ')}>
          {g.filas.slice(0, 4).map((f) => <Avatar key={f.id} usuario={{ username: f.con_usuario, nombre_mostrar: f.con_nombre }} tam={24} color={theme.accent} borde={theme.cardBg} />)}
          {g.filas.length > 4 && <span className="rc-mas" style={{ backgroundColor: theme.subtleBg, color: theme.textSecondary }}>+{g.filas.length - 4}</span>}
        </span>
      </>
    );
  };

  // ---- Renglones dentro del grupo ----
  const renglones = (g) => {
    const ids = [...new Set(g.filas.filter((f) => f.expediente_id).map((f) => f.expediente_id))];
    return (
      <div className="rc-cuerpo" style={{ borderColor: theme.border }}>
        {ids.length > 1 && (
          <div className="rc-cuerpo-barra" style={{ borderColor: theme.border, backgroundColor: theme.subtleBg }}>
            <label className="rc-marcar-todos" style={{ color: theme.textPrimary }}>
              {casillaVarias(ids, `Marcar los ${ids.length} expedientes`)}
              <span>Marcar {vista === 'persona' ? `los ${ids.length} expedientes de ${g.filas[0].con_nombre}` : 'este expediente'}</span>
            </label>
            <button type="button" className="boton-barra" onClick={() => compartirOtraVez(ids, vista === 'persona' ? `${ids.length} expedientes de ${g.filas[0].con_nombre}` : g.filas[0].acreditado)}
              style={{ backgroundColor: theme.cardBg, color: theme.accent, borderColor: theme.border }}>
              <Share2 size={14} /> Compartir los {ids.length} con alguien más
            </button>
          </div>
        )}
        {g.filas.map((f) => (
          <div key={f.id} className="rc-renglon" style={{ borderColor: theme.border }}>
            {vista === 'persona' ? (
              <>
                {casilla(f.expediente_id, f.acreditado)}
                <span className="rc-renglon-texto">
                  <strong style={{ color: theme.textPrimary }}>{f.todos ? `Todos los expedientes de ${f.propietario_nombre}` : (f.acreditado || 'Sin nombre')}</strong>
                  <small style={{ color: theme.textSecondary }}>
                    {f.todos ? '' : `Crédito ${f.numero_credito} · de ${f.propietario_nombre} · `}
                    compartió {f.compartio === yo ? 'tú' : f.compartio_nombre} · {cuando(f.creado_en)}
                  </small>
                </span>
                {!f.todos && estado(f)}
              </>
            ) : (
              <>
                <Avatar usuario={{ username: f.con_usuario, nombre_mostrar: f.con_nombre }} tam={26} color={theme.accent} />
                <span className="rc-renglon-texto">
                  <strong style={{ color: theme.textPrimary }}>{f.con_nombre} <span style={{ fontWeight: 500, color: theme.textSecondary }}>· {ROL[f.con_rol] || f.con_rol}</span></strong>
                  <small style={{ color: theme.textSecondary }}>compartió {f.compartio === yo ? 'tú' : f.compartio_nombre} · {cuando(f.creado_en)}</small>
                </span>
              </>
            )}
            <span className="rc-acciones">
              {vista === 'persona' && f.expediente_id && (
                <button type="button" className="rc-accion" title="Compartir con alguien más" aria-label="Compartir con alguien más"
                  onClick={() => compartirOtraVez([f.expediente_id], f.acreditado)} style={{ color: theme.accent }}><Share2 size={14} /></button>
              )}
              {botonQuitar(f)}
            </span>
          </div>
        ))}
        {ids.length === 1 && (
          <div className="rc-pie">
            <button type="button" className="boton-barra" onClick={() => compartirOtraVez(ids, vista === 'persona' ? `${ids.length} expedientes de ${g.filas[0].con_nombre}` : g.filas[0].acreditado)}
              style={{ backgroundColor: theme.cardBg, color: theme.accent, borderColor: theme.border }}>
              <Share2 size={14} /> {vista === 'persona' ? `Compartir ${ids.length === 1 ? 'este expediente' : `estos ${ids.length}`} con alguien más` : 'Compartir con alguien más'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="registro-compartidos">
      <div className="rc-encabezado">
        <div>
          <h2 style={{ color: theme.textPrimary }}><Share2 size={20} color={theme.accent} /> Expedientes compartidos</h2>
          <p style={{ color: theme.textSecondary }}>Con quién, cuántos y cuáles expedientes se compartieron.</p>
        </div>
        <button type="button" className="rc-accion rc-actualizar" onClick={recargar} title="Actualizar" aria-label="Actualizar" style={{ color: theme.textSecondary, borderColor: theme.border }}>
          <RefreshCw size={15} className={filas === null ? 'girando' : ''} />
        </button>
      </div>

      <div className="rc-cifras" style={{ color: theme.textSecondary }}>
        {[[lista.length, 'accesos', Share2], [expedientesIds.size, 'expedientes', FolderOpen], [personas.size, 'personas', Users],
          [lista.filter((f) => f.compartio === yo).length, 'compartidos por ti', ListChecks]].map(([v, t, I]) => (
          <span key={t} style={{ backgroundColor: theme.subtleBg, borderColor: theme.border }}>
            <I size={13} color={theme.accent} /> <strong style={{ color: theme.textPrimary }}>{filas === null ? '…' : v}</strong> {t}
          </span>
        ))}
      </div>

      <div className="rc-barra">
        <div className="hf-segmentos rc-vistas" role="tablist" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
          {[['persona', 'Por persona'], ['expediente', 'Por expediente']].map(([id, n]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} className={`hf-segmento ${vista === id ? 'activo' : ''}`}
              onClick={() => { setVista(id); setAbiertos({}); }}
              style={vista === id ? { backgroundColor: theme.accent, color: '#fff' } : { color: theme.textSecondary }}>{n}</button>
          ))}
        </div>
        <label className="hf-buscar" style={{ borderColor: theme.border, backgroundColor: theme.inputBg }}>
          <Search size={15} color={theme.textSecondary} />
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar persona, acreditado o crédito…" aria-label="Buscar" style={{ color: theme.textPrimary }} />
          {busca && <button type="button" onClick={() => setBusca('')} aria-label="Limpiar búsqueda" className="buscar-limpiar" style={{ color: theme.textSecondary }}><X size={14} /></button>}
        </label>
        <label className="hf-orden" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}>
          <span className="hf-orden-texto" style={{ color: theme.textSecondary }}>Compartió:</span>
          <Selector value={quienCompartio} onChange={(e) => setQuienCompartio(e.target.value)} aria-label="Quién compartió"
            style={{ border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', fontWeight: 600, padding: '8px 0', cursor: 'pointer' }}>
            <option value="">Cualquiera</option>
            {compartieron.map(([u, n]) => <option key={u} value={u}>{u === yo ? `${n} (tú)` : n}</option>)}
          </Selector>
        </label>
      </div>

      {idsVisibles.length > 0 && (
        <div className={`barra-marcados rc-seleccion ${marcadosIds.length ? 'con-marcas' : ''}`}
          style={marcadosIds.length ? { borderColor: theme.accent, backgroundColor: `${theme.accent}12`, color: theme.textPrimary } : { borderColor: theme.border, backgroundColor: theme.subtleBg, color: theme.textPrimary }}>
          <label className="rc-marcar-todos">
            {casillaVarias(idsVisibles, 'Marcar todos los que se ven')}
            <span>{busca.trim() || quienCompartio ? `Marcar los ${idsVisibles.length} que se ven` : `Marcar todos (${idsVisibles.length})`}</span>
          </label>
          {marcadosIds.length > 0 ? (
            <>
              <strong className="rc-marcados-n"><ListChecks size={15} color={theme.accent} /> {marcadosIds.length} marcado(s)</strong>
              <button type="button" className="boton-barra boton-compartir" onClick={() => compartirOtraVez(marcadosIds, marcadosIds.length === 1 ? (lista.find((f) => f.expediente_id === marcadosIds[0])?.acreditado || '') : `${marcadosIds.length} expedientes`)}>
                <Share2 size={14} /> Compartir {marcadosIds.length === 1 ? 'con alguien más' : `los ${marcadosIds.length} con alguien más`}
              </button>
              <button type="button" className="boton-barra boton-word" onClick={() => descargarZipIds(marcadosIds, 'Compartidos')} disabled={descargandoZipIds}>
                {descargandoZipIds ? <Loader2 size={14} className="girando" /> : <FileArchive size={14} />} Descargar Word ({marcadosIds.length})
              </button>
              <button type="button" className="enlace-pequeno" onClick={() => setMarcados({})} style={{ marginLeft: 'auto' }}>Quitar marcas</button>
            </>
          ) : (
            <span className="rc-pista" style={{ color: theme.textSecondary }}>o márcalos uno por uno para compartirlos con alguien más</span>
          )}
        </div>
      )}

      {filas === null ? (
        <div className="bitacora-cargando" style={{ color: theme.textSecondary, padding: '30px' }}><Loader2 size={18} className="girando" /> Cargando…</div>
      ) : grupos.length === 0 ? (
        <div className="registro-vacio" style={{ color: theme.textSecondary }}>
          <Share2 size={26} color={theme.accent} />
          {lista.length === 0 ? 'Todavía no se ha compartido ningún expediente.' : 'Nada coincide con la búsqueda.'}
        </div>
      ) : (
        <div className="rc-grupos">
          {gruposPagina.map((g) => {
            const abierto = estaAbierto(g);
            return (
              <section key={g.clave} className={`rc-grupo ${abierto ? 'abierto' : ''}`} style={{ borderColor: abierto ? `${theme.accent}66` : theme.border, backgroundColor: theme.cardBg }}>
                <div className="rc-cabecera" role="button" tabIndex={0} aria-expanded={abierto}
                  onClick={() => setAbiertos((a) => ({ ...a, [g.clave]: !abierto }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbiertos((a) => ({ ...a, [g.clave]: !abierto })); } }}>
                  {cabecera(g)}
                  <ChevronDown size={16} className="rc-flecha" color={theme.textSecondary} />
                </div>
                {abierto && renglones(g)}
              </section>
            );
          })}
          {grupos.length > POR_PAGINA && (
            <nav className="paginacion-lote" aria-label="Páginas" style={{ borderColor: theme.border, color: theme.textSecondary }}>
              <span>{(paginaVista - 1) * POR_PAGINA + 1}–{Math.min(paginaVista * POR_PAGINA, grupos.length)} de {grupos.length}</span>
              <div className="paginacion-botones">
                <button type="button" onClick={() => setPagina(paginaVista - 1)} disabled={paginaVista === 1} aria-label="Página anterior" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronLeft size={15} /></button>
                <span style={{ padding: '0 8px' }}>{paginaVista} / {totalPaginas}</span>
                <button type="button" onClick={() => setPagina(paginaVista + 1)} disabled={paginaVista === totalPaginas} aria-label="Página siguiente" style={{ borderColor: theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}><ChevronRight size={15} /></button>
              </div>
              <span />
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

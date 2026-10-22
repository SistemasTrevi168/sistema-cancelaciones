import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, Share2, UserCheck, Users, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import Avatar from './Avatar';
import { avisar, confirmar } from '../ui/notificaciones';

const ROL = { revisor: 'Revisor', operador: 'Operador', admin: 'Administrador' };

// Ventana para dar o quitar acceso a expedientes.
//  - { ids: [uno] }   : ese expediente (se ve quién tiene acceso y se puede quitar)
//  - { ids: [varios] }: dar acceso a varios a la vez
//  - { todos: true }  : todos mis expedientes, también los que haga después
export default function ModalCompartir({ ids = [], todos = false, titulo = '', onCerrar, onListo }) {
  const { theme, isDarkMode } = useApp();
  const [gente, setGente] = useState(null);
  const [actuales, setActuales] = useState({}); // usuario -> { directo, todos }
  const [elegidos, setElegidos] = useState({});
  const [busca, setBusca] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const uno = !todos && ids.length === 1;
  const gestiona = todos || uno; // se ve (y se puede quitar) quién tiene acceso
  const clave = todos ? 'todos' : ids.join(',');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [dir, acc] = await Promise.all([
          api.get('/compartir/directorio'),
          todos ? api.get('/compartir/todos') : (uno ? api.get(`/compartir/expediente/${ids[0]}`) : Promise.resolve({ data: [] })),
        ]);
        if (!vivo) return;
        const mapa = Object.fromEntries((acc.data || []).map((a) => [a.usuario, { directo: todos ? true : !!a.directo, todos: todos ? false : !!a.todos }]));
        setGente(dir.data || []);
        setActuales(mapa);
        setElegidos(Object.fromEntries(Object.entries(mapa).filter(([, a]) => a.directo).map(([u]) => [u, true])));
      } catch (err) {
        if (!vivo) return;
        avisar.error(err.response?.data?.detail || 'No se pudo cargar la lista de personas.');
        setGente([]);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const cerrar = () => {
    setSaliendo(true);
    setTimeout(() => onCerrar?.(), 160);
  };
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const visibles = useMemo(() => (gente || []).filter((p) => !busca.trim() || normal(`${p.nombre} ${p.usuario}`).includes(normal(busca))), [gente, busca]);
  const agregar = Object.keys(elegidos).filter((u) => elegidos[u] && !actuales[u]?.directo);
  const quitar = gestiona ? Object.keys(actuales).filter((u) => actuales[u]?.directo && !elegidos[u]) : [];
  const hayCambios = agregar.length > 0 || quitar.length > 0;
  const alternar = (u) => setElegidos((e) => ({ ...e, [u]: !e[u] }));
  const nombreDe = (u) => (gente || []).find((p) => p.usuario === u)?.nombre || u;

  const guardar = async () => {
    if (!hayCambios) { cerrar(); return; }
    if (quitar.length && !(await confirmar(
      `${quitar.map(nombreDe).join(', ')} ya no ${quitar.length === 1 ? 'podrá' : 'podrán'} ver ${todos ? 'tus expedientes' : (uno ? 'este expediente' : 'estos expedientes')}.`,
      { titulo: 'Quitar acceso', textoConfirmar: 'Quitar acceso', peligro: true },
    ))) return;
    setGuardando(true);
    try {
      const base = todos ? { todos: true } : { ids };
      if (agregar.length) await api.post('/compartir', { ...base, usuarios: agregar });
      if (quitar.length) await api.post('/compartir/quitar', { ...base, usuarios: quitar });
      const partes = [];
      if (agregar.length) partes.push(`se dio acceso a ${agregar.map(nombreDe).join(', ')}`);
      if (quitar.length) partes.push(`se quitó el acceso a ${quitar.map(nombreDe).join(', ')}`);
      const que = todos ? 'Todos tus expedientes' : (uno ? 'Expediente' : `${ids.length} expediente(s)`);
      avisar.exito(`${que}: ${partes.join(' y ')}.`);
      onListo?.();
      cerrar();
    } catch (err) {
      avisar.error(err.response?.status === 404 ? 'El servidor todavía no tiene esta función (falta publicar la versión nueva).' : (err.response?.data?.detail || 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  const encabezado = todos ? 'Compartir todos mis expedientes' : (uno ? 'Compartir expediente' : `Compartir ${ids.length} expedientes`);
  const explicacion = todos
    ? 'Los revisores que elijas verán TODOS tus expedientes, también los que hagas después. Podrán revisarlos, editarlos, cambiar su estado y descargar el Word.'
    : 'Los revisores que elijas podrán revisar, editar, cambiar el estado y descargar el Word. Los expedientes siguen siendo tuyos.';

  return (
    <div className={`fondo-modal ${saliendo ? 'saliendo' : ''}`} onClick={cerrar} role="dialog" aria-modal="true" aria-labelledby="compartir-titulo">
      <div className={`modal-compartir ${saliendo ? 'modal-salida' : 'modal-entrada'}`} onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
        <header className="modal-compartir-encabezado" style={{ borderColor: theme.border }}>
          <span className="modal-compartir-icono" style={{ backgroundColor: `${theme.accent}1a`, color: theme.accent }}>{todos ? <Users size={20} /> : <Share2 size={20} />}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="compartir-titulo">{encabezado}</h3>
            {titulo && <small style={{ color: theme.textSecondary }}>{titulo}</small>}
          </div>
          <button type="button" className="bitacora-cerrar" onClick={cerrar} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={20} /></button>
        </header>
        <p className="modal-compartir-texto" style={{ color: theme.textSecondary }}>{explicacion}</p>

        <label className="zona-buscador-campo modal-compartir-buscar" style={{ borderColor: theme.border, backgroundColor: theme.inputBg }}>
          <Search size={14} color={theme.textSecondary} />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar revisor…" style={{ color: theme.textPrimary }} />
        </label>

        <div className="modal-compartir-lista">
          {gente === null && <div className="bitacora-cargando" style={{ color: theme.textSecondary }}><Loader2 size={18} className="girando" /> Cargando…</div>}
          {gente && visibles.length === 0 && (
            <div style={{ color: theme.textSecondary, fontSize: '13px', padding: '12px', lineHeight: 1.5 }}>
              {gente.length === 0
                ? 'Todavía no hay usuarios de tipo Revisor. El administrador los crea (o cambia su tipo) en Usuarios.'
                : 'No hay revisores que coincidan.'}
            </div>
          )}
          {visibles.map((p, i) => {
            const marcado = !!elegidos[p.usuario];
            const porTodos = !todos && actuales[p.usuario]?.todos;
            return (
              <div key={p.usuario} role="checkbox" tabIndex={porTodos ? -1 : 0} aria-checked={marcado || porTodos} aria-disabled={porTodos || undefined}
                className={`persona-compartir ${marcado || porTodos ? 'elegida' : ''} ${porTodos ? 'bloqueada' : ''}`}
                onClick={() => !porTodos && alternar(p.usuario)}
                onKeyDown={(e) => { if (!porTodos && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); alternar(p.usuario); } }}
                style={{ animationDelay: `${Math.min(i, 10) * 25}ms`, borderColor: marcado ? theme.accent : theme.border, backgroundColor: marcado ? `${theme.accent}10` : 'transparent', color: theme.textPrimary }}>
                <Avatar usuario={{ username: p.usuario, nombre_mostrar: p.nombre }} tam={30} color={theme.accent} />
                <span className="persona-compartir-texto">
                  <strong>{p.nombre}</strong>
                  <small style={{ color: theme.textSecondary }}>@{p.usuario} · {ROL[p.rol] || p.rol}{porTodos ? ' · ya ve todos tus expedientes' : ''}</small>
                </span>
                {(actuales[p.usuario]?.directo || porTodos) && <span className="chip-dato chip-ok" style={{ fontSize: '10px' }}><UserCheck size={11} /> Con acceso</span>}
                <span className="persona-compartir-marca" style={{ borderColor: marcado || porTodos ? theme.accent : theme.border, backgroundColor: marcado || porTodos ? theme.accent : 'transparent' }}>
                  {(marcado || porTodos) && <Check size={13} color="#fff" />}
                </span>
              </div>
            );
          })}
        </div>

        <footer className="modal-compartir-pie" style={{ borderColor: theme.border }}>
          <small style={{ color: isDarkMode ? '#a5b4fc' : theme.textSecondary }}>
            {hayCambios ? [agregar.length ? `+${agregar.length} con acceso` : '', quitar.length ? `−${quitar.length} sin acceso` : ''].filter(Boolean).join(' · ') : 'Marca o desmarca revisores'}
          </small>
          <button type="button" className="boton-barra" onClick={cerrar} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>Cancelar</button>
          <button type="button" className="boton-barra boton-guardar" onClick={guardar} disabled={guardando || !hayCambios}>
            {guardando ? <Loader2 size={15} className="girando" /> : <Share2 size={15} />} Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import { escuchar } from '../ui/eventosTiempoReal';
import Avatar from './Avatar';

const cuando = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia
    ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

// Comentarios de un expediente: conversación entre quien lo hizo y quienes lo revisan.
// A los demás les llega un aviso en la campana; si la ventana está abierta, los nuevos aparecen al instante.
export default function ModalComentarios({ expediente, onCerrar, onConteo }) {
  const { theme, isDarkMode } = useApp();
  const id = String(expediente?.id || expediente?.expediente_id || '');
  const nombre = expediente?.acreditado || expediente?.datos_extraidos?.nombre_acreditado || 'Expediente';
  const credito = expediente?.numero_credito || expediente?.credito || '';
  const [datos, setDatos] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [version, setVersion] = useState(0);
  const lista = useRef(null);
  const area = useRef(null);
  const onConteoRef = useRef(onConteo);
  useEffect(() => { onConteoRef.current = onConteo; });

  useEffect(() => {
    let vivo = true;
    api.get(`/expedientes/${id}/comentarios`)
      .then((r) => { if (vivo) { setDatos(r.data); onConteoRef.current?.(id, r.data?.comentarios?.length || 0); } })
      .catch(() => { if (vivo) setDatos({ comentarios: [], participantes: [], error: true }); });
    return () => { vivo = false; };
  }, [id, version]);
  // En tiempo real: si alguien comenta en este expediente, se recarga
  useEffect(() => escuchar('comentarios', (d) => { if (String(d?.expediente_id) === id) setVersion((v) => v + 1); }), [id]);
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [datos]);
  useEffect(() => {
    area.current?.focus();
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const r = await api.post(`/expedientes/${id}/comentarios`, { texto: t });
      setDatos(r.data);
      setTexto('');
      onConteoRef.current?.(id, r.data?.comentarios?.length || 0);
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo enviar el comentario.');
    } finally {
      setEnviando(false);
      area.current?.focus();
    }
  };
  const borrar = async (c) => {
    if (!(await confirmar('Se quitará tu comentario para todos.', { titulo: '¿Borrar comentario?', textoConfirmar: 'Borrar', peligro: true }))) return;
    try {
      await api.delete(`/comentarios/${c.id}`);
      setVersion((v) => v + 1);
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo borrar.');
    }
  };

  const comentarios = datos?.comentarios || [];
  const participantes = datos?.participantes || [];

  return createPortal(
    <div className="fondo-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal-comentarios modal-entrada" role="dialog" aria-modal="true" aria-labelledby="titulo-comentarios"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
        <header style={{ borderColor: theme.border }}>
          <span className="modal-comentarios-icono" style={{ backgroundColor: `${theme.accent}1a`, color: theme.accent }}><MessageCircle size={18} /></span>
          <div>
            <h3 id="titulo-comentarios">Comentarios</h3>
            <p style={{ color: theme.textSecondary }}>{nombre}{credito ? ` · Crédito ${credito}` : ''}</p>
          </div>
          <button type="button" className="modal-observaciones-cerrar" onClick={onCerrar} aria-label="Cerrar" style={{ color: theme.textSecondary }}><X size={18} /></button>
        </header>
        {participantes.length > 0 && (
          <p className="comentarios-quienes" style={{ color: theme.textSecondary, borderColor: theme.border }}>
            Lo ven: {participantes.map((p) => p.nombre).join(', ')}
          </p>
        )}
        <div ref={lista} className="comentarios-lista" style={{ backgroundColor: isDarkMode ? '#0b1220' : '#f8fafc' }}>
          {datos === null && <div className="comentarios-vacio" style={{ color: theme.textSecondary }}><Loader2 size={18} className="girando" /> Cargando…</div>}
          {datos && comentarios.length === 0 && (
            <div className="comentarios-vacio" style={{ color: theme.textSecondary }}>
              <MessageCircle size={24} color={theme.accent} />
              {datos.error ? 'No se pudieron cargar los comentarios.' : 'Todavía no hay comentarios. Escribe el primero: a los demás les llegará un aviso.'}
            </div>
          )}
          {comentarios.map((c) => (
            <div key={c.id} className={`comentario ${c.mio ? 'mio' : ''}`}>
              {!c.mio && <Avatar usuario={{ username: c.usuario, nombre_mostrar: c.nombre, foto: c.foto }} tam={28} color={theme.accent} />}
              <div className="comentario-burbuja" style={c.mio ? { backgroundColor: theme.accent, color: '#fff' } : { backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
                {!c.mio && <strong>{c.nombre}</strong>}
                <p>{c.texto}</p>
                <small style={{ opacity: 0.75 }}>
                  {cuando(c.creado_en)}
                  {c.mio && <button type="button" className="comentario-borrar" onClick={() => borrar(c)} title="Borrar mi comentario" aria-label="Borrar mi comentario"><Trash2 size={12} /></button>}
                </small>
              </div>
            </div>
          ))}
        </div>
        <footer style={{ borderColor: theme.border }}>
          <textarea ref={area} rows={2} maxLength={1500} value={texto} placeholder="Escribe un comentario… (Enter para enviar, Shift+Enter para otra línea)"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }} />
          <button type="button" className="comentarios-enviar" onClick={enviar} disabled={!texto.trim() || enviando} aria-label="Enviar comentario"
            style={{ backgroundColor: theme.accent }}>
            {enviando ? <Loader2 size={17} className="girando" /> : <Send size={17} />}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

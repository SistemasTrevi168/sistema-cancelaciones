import { useEffect, useRef, useState } from 'react';
import {
  Camera, Check, KeyRound, Laptop, Loader2, LogOut, Monitor, Moon, Palette, ShieldCheck, Smartphone, Sun, Trash2, UserRound,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import { COLORES_ACENTO, colorLegible } from '../colores';
import Avatar from './Avatar';
import RecortarFoto from './RecortarFoto';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (iso) => {
  if (!iso) return '—';
  const [f, h] = iso.split(' ');
  const [a, m, d] = f.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}${h ? `, ${h}` : ''}`;
};
const TEMAS = [
  { id: 'claro', nombre: 'Claro', icono: Sun },
  { id: 'oscuro', nombre: 'Oscuro', icono: Moon },
  { id: 'sistema', nombre: 'Automático', icono: Monitor, nota: 'Igual que tu computadora' },
];

function Seccion({ icono: Icono, titulo, children, theme, accion }) {
  return (
    <section className="perfil-seccion" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
      <header>
        <h3 style={{ color: theme.textPrimary }}><Icono size={17} color={theme.accent} /> {titulo}</h3>
        {accion}
      </header>
      {children}
    </section>
  );
}

export default function TabPerfil() {
  const {
    theme, isDarkMode, currentUser, setCurrentUser, setModalPassword,
    temaPreferido, cambiarTema, colorAcento, setColorAcento, guardarPreferencias,
  } = useApp();
  const [perfil, setPerfil] = useState(null);
  const [nombre, setNombre] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [archivoFoto, setArchivoFoto] = useState(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [cerrando, setCerrando] = useState('');
  const entradaFoto = useRef(null);
  const temporizadorColor = useRef(null);

  const aplicar = (p) => {
    setPerfil(p);
    setCurrentUser((u) => (u ? { ...u, nombre_mostrar: p.nombre_mostrar, foto: p.foto, color_acento: p.color_acento, tema: p.tema } : u));
  };

  useEffect(() => {
    let vigente = true;
    api.get('/perfil')
      .then((res) => { if (vigente) { setPerfil(res.data); setNombre(res.data.nombre_mostrar || ''); } })
      .catch(() => avisar.error('No se pudo cargar tu perfil.'));
    return () => { vigente = false; };
  }, []);

  const guardarNombre = async (e) => {
    e?.preventDefault();
    setGuardandoNombre(true);
    try {
      const res = await api.put('/perfil', { nombre_mostrar: nombre });
      aplicar(res.data);
      setNombre(res.data.nombre_mostrar || '');
      avisar.exito('Nombre actualizado.');
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo guardar el nombre.');
    } finally {
      setGuardandoNombre(false);
    }
  };

  const elegirFoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { avisar.aviso('Elige una imagen (JPG, PNG o WEBP).'); return; }
    if (f.size > 15 * 1024 * 1024) { avisar.aviso('La imagen es muy grande (máximo 15 MB).'); return; }
    setArchivoFoto(f);
  };

  const guardarFoto = async (dataUrl) => {
    setSubiendoFoto(true);
    try {
      const res = await api.put('/perfil/foto', { foto: dataUrl });
      aplicar(res.data);
      setArchivoFoto(null);
      avisar.exito('Foto actualizada.');
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo guardar la foto.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const quitarFoto = async () => {
    if (!(await confirmar('Se mostrará tu inicial en lugar de la foto.', { titulo: '¿Quitar tu foto?', textoConfirmar: 'Quitar foto' }))) return;
    try {
      const res = await api.delete('/perfil/foto');
      aplicar(res.data);
    } catch {
      avisar.error('No se pudo quitar la foto.');
    }
  };

  const elegirColor = (color, guardarYa = true) => {
    setColorAcento(color);
    clearTimeout(temporizadorColor.current);
    const guardar = () => guardarPreferencias({ color_acento: color });
    if (guardarYa) guardar(); else temporizadorColor.current = setTimeout(guardar, 600);
  };
  useEffect(() => () => clearTimeout(temporizadorColor.current), []);

  const cerrarSesion = async (s) => {
    setCerrando(s.id);
    try {
      const res = await api.delete(`/perfil/sesiones/${s.id}`);
      aplicar(res.data);
      avisar.exito(`Se cerró la sesión de ${s.dispositivo}.`);
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo cerrar esa sesión.');
    } finally {
      setCerrando('');
    }
  };
  const cerrarOtras = async () => {
    if (!(await confirmar('Tendrás que volver a entrar en esos dispositivos. Esta sesión sigue abierta.', { titulo: '¿Cerrar las demás sesiones?', textoConfirmar: 'Cerrar las demás', peligro: true }))) return;
    setCerrando('todas');
    try {
      const res = await api.post('/perfil/sesiones/cerrar-otras');
      aplicar(res.data);
      avisar.exito('Se cerraron tus otras sesiones.');
    } catch {
      avisar.error('No se pudieron cerrar las otras sesiones.');
    } finally {
      setCerrando('');
    }
  };

  const usuarioVista = { ...currentUser, ...(perfil ? { nombre_mostrar: perfil.nombre_mostrar, foto: perfil.foto } : {}) };
  const resumen = perfil?.resumen;
  const maxDia = Math.max(1, ...(resumen?.ultimos_14_dias || []).map((d) => d.total));
  const colorPersonal = !COLORES_ACENTO.some((c) => c.valor === colorAcento);
  const otras = (perfil?.sesiones || []).filter((s) => !s.actual).length;
  const boton = { backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border };

  return (
    <div className="perfil">
      <div className="carga-encabezado">
        <h2 style={{ color: theme.textPrimary }}><UserRound size={20} color={theme.accent} /> Mi perfil</h2>
        <p style={{ color: theme.textSecondary }}>Tu foto, cómo te ven los demás, el color y el tema del sistema, tu resumen de trabajo y la seguridad de tu cuenta.</p>
      </div>

      {/* Tarjeta principal */}
      <section className="perfil-portada" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
        <div className="perfil-franja" style={{ background: `linear-gradient(120deg, ${theme.accent}, ${theme.accent}99)` }} />
        <div className="perfil-portada-contenido">
          <div className="perfil-foto">
            <Avatar usuario={usuarioVista} tam={112} color={theme.accent} borde={theme.cardBg} />
            <button type="button" className="perfil-foto-boton" onClick={() => entradaFoto.current?.click()} title="Cambiar foto" aria-label="Cambiar foto" style={{ backgroundColor: theme.accent }}>
              {subiendoFoto ? <Loader2 size={16} className="girando" /> : <Camera size={16} />}
            </button>
            <input ref={entradaFoto} id="perfil-foto" type="file" accept="image/*" onChange={elegirFoto} style={{ display: 'none' }} />
          </div>
          <div className="perfil-identidad">
            <h3 style={{ color: theme.textPrimary }}>{usuarioVista.nombre_mostrar || usuarioVista.username}</h3>
            <p style={{ color: theme.textSecondary }}>
              @{usuarioVista.username} · {perfil?.es_admin ?? currentUser?.es_admin ? 'Administrador' : 'Operador'}
              {perfil?.creado_en ? ` · desde ${fechaCorta(perfil.creado_en.slice(0, 10))}` : ''}
            </p>
            <div className="perfil-foto-acciones">
              <button type="button" className="boton-barra" onClick={() => entradaFoto.current?.click()} style={boton}><Camera size={14} color={theme.accent} /> {usuarioVista.foto ? 'Cambiar foto' : 'Subir foto'}</button>
              {usuarioVista.foto && <button type="button" className="boton-barra" onClick={quitarFoto} style={boton}><Trash2 size={14} color="#dc2626" /> Quitar</button>}
            </div>
          </div>
          <form className="perfil-nombre" onSubmit={guardarNombre}>
            <label htmlFor="perfil-nombre" style={{ color: theme.textSecondary }}>Nombre para mostrar</label>
            <div>
              <input
                id="perfil-nombre"
                type="text"
                maxLength={60}
                value={nombre}
                placeholder={currentUser?.username}
                onChange={(e) => setNombre(e.target.value)}
                style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.textPrimary }}
              />
              <button type="submit" className="boton-barra" disabled={guardandoNombre || nombre.trim() === (perfil?.nombre_mostrar || '')} style={{ backgroundColor: theme.accent, borderColor: theme.accent, color: '#fff' }}>
                {guardandoNombre ? <Loader2 size={14} className="girando" /> : <Check size={14} />} Guardar
              </button>
            </div>
            <small style={{ color: theme.textSecondary }}>Así apareces en el menú y en los reportes. Para entrar sigues usando “{currentUser?.username}”.</small>
          </form>
        </div>
      </section>

      <div className="perfil-columnas">
        {/* Mi resumen */}
        <Seccion icono={Check} titulo="Mi resumen" theme={theme}>
          {!resumen ? (
            <div className="perfil-cargando" style={{ color: theme.textSecondary }}><Loader2 size={16} className="girando" /> Cargando…</div>
          ) : (
            <>
              <div className="perfil-cifras">
                {[['Hoy', resumen.hoy], ['Esta semana', resumen.semana], ['Este mes', resumen.mes], ['En total', resumen.total]].map(([t, v]) => (
                  <div key={t} style={{ backgroundColor: theme.subtleBg }}>
                    <span style={{ color: theme.textSecondary }}>{t}</span>
                    <strong style={{ color: theme.textPrimary }}>{v}</strong>
                  </div>
                ))}
              </div>
              <div className="perfil-mini-grafica" aria-label="Expedientes de los últimos 14 días">
                {resumen.ultimos_14_dias.map((d) => (
                  <div key={d.fecha} className="perfil-mini-col" title={`${fechaCorta(d.fecha)}: ${d.total}`}>
                    <div style={{ height: `${(d.total / maxDia) * 100}%`, backgroundColor: theme.accent }} />
                  </div>
                ))}
              </div>
              <p className="perfil-nota" style={{ color: theme.textSecondary }}>
                Últimos 14 días · último expediente: <strong style={{ color: theme.textPrimary }}>{resumen.ultimo_expediente ? fechaCorta(resumen.ultimo_expediente) : 'todavía ninguno'}</strong>
              </p>
            </>
          )}
        </Seccion>

        {/* Apariencia */}
        <Seccion icono={Palette} titulo="Apariencia" theme={theme}>
          <p className="perfil-etiqueta" style={{ color: theme.textSecondary }}>Color del sistema</p>
          <div className="perfil-colores" role="radiogroup" aria-label="Color del sistema">
            {COLORES_ACENTO.map((c) => (
              <button
                key={c.valor}
                type="button"
                role="radio"
                aria-checked={colorAcento === c.valor}
                title={c.nombre}
                aria-label={c.nombre}
                className={`perfil-color ${colorAcento === c.valor ? 'elegido' : ''}`}
                onClick={() => elegirColor(c.valor)}
                style={{ backgroundColor: c.valor, '--anillo': theme.textPrimary }}
              >
                {colorAcento === c.valor && <Check size={15} color="#fff" />}
              </button>
            ))}
            <label className={`perfil-color perfil-color-propio ${colorPersonal ? 'elegido' : ''}`} title="Elegir otro color" style={{ '--anillo': theme.textPrimary, background: colorPersonal ? colorAcento : 'conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)' }}>
              {colorPersonal && <Check size={15} color="#fff" />}
              <input id="perfil-color-propio" type="color" value={colorAcento} onChange={(e) => elegirColor(e.target.value, false)} aria-label="Elegir otro color" />
            </label>
          </div>
          {colorLegible(colorAcento) !== colorAcento.toLowerCase() && (
            <p className="perfil-nota" style={{ color: theme.textSecondary }}>Ese color es muy claro para leer texto blanco encima; se usa un tono un poco más oscuro.</p>
          )}

          <p className="perfil-etiqueta" style={{ color: theme.textSecondary }}>Tema</p>
          <div className="perfil-temas" role="radiogroup" aria-label="Tema">
            {TEMAS.map((t) => {
              const Icono = t.icono;
              const elegido = temaPreferido === t.id;
              const oscuroVista = t.id === 'oscuro' || (t.id === 'sistema' && isDarkMode && temaPreferido === 'sistema');
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={elegido}
                  className={`perfil-tema ${elegido ? 'elegido' : ''}`}
                  onClick={() => cambiarTema(t.id)}
                  style={{ borderColor: elegido ? theme.accent : theme.border, backgroundColor: theme.cardBg, color: theme.textPrimary }}
                >
                  <span className={`perfil-tema-muestra ${t.id === 'sistema' ? 'mitad' : oscuroVista ? 'oscura' : 'clara'}`}>
                    <i style={{ backgroundColor: theme.accent }} /><i /><i />
                  </span>
                  <span className="perfil-tema-nombre"><Icono size={14} /> {t.nombre}</span>
                  {t.nota && <small style={{ color: theme.textSecondary }}>{t.nota}</small>}
                </button>
              );
            })}
          </div>
        </Seccion>
      </div>

      {/* Seguridad */}
      <Seccion
        icono={ShieldCheck}
        titulo="Seguridad"
        theme={theme}
        accion={<button type="button" className="boton-barra" onClick={() => setModalPassword({ modo: 'propio' })} style={boton}><KeyRound size={14} color={theme.accent} /> Cambiar contraseña</button>}
      >
        <div className="perfil-sesiones-encabezado">
          <p className="perfil-etiqueta" style={{ color: theme.textSecondary, margin: 0 }}>Sesiones abiertas ({perfil?.sesiones?.length ?? '…'})</p>
          {otras > 0 && (
            <button type="button" className="boton-barra" onClick={cerrarOtras} disabled={cerrando === 'todas'} style={{ ...boton, color: '#dc2626' }}>
              {cerrando === 'todas' ? <Loader2 size={14} className="girando" /> : <LogOut size={14} />} Cerrar todas las demás
            </button>
          )}
        </div>
        <ul className="perfil-sesiones">
          {(perfil?.sesiones || []).map((s) => {
            const Icono = /iPhone|Android|iPad/.test(s.dispositivo) ? Smartphone : Laptop;
            return (
              <li key={s.id} style={{ borderColor: theme.border }}>
                <span className="perfil-sesion-icono" style={{ backgroundColor: theme.subtleBg, color: theme.textSecondary }}><Icono size={18} /></span>
                <span className="perfil-sesion-datos">
                  <strong style={{ color: theme.textPrimary }}>
                    {s.dispositivo}
                    {s.actual && <span className="perfil-chip" style={{ backgroundColor: `${theme.accent}1f`, color: theme.accent }}>Esta sesión</span>}
                  </strong>
                  <small style={{ color: theme.textSecondary }}>
                    {s.ip ? `IP ${s.ip} · ` : ''}Entró {fechaCorta(s.inicio)} · Último uso {fechaCorta(s.ultimo_uso)}
                  </small>
                </span>
                {!s.actual && (
                  <button type="button" className="boton-barra" onClick={() => cerrarSesion(s)} disabled={cerrando === s.id} style={boton}>
                    {cerrando === s.id ? <Loader2 size={14} className="girando" /> : <LogOut size={14} />} Cerrar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="perfil-nota" style={{ color: theme.textSecondary }}>Si ves un dispositivo que no reconoces, ciérralo y cambia tu contraseña. Al cambiar la contraseña también se cierran las demás sesiones.</p>
      </Seccion>

      {archivoFoto && (
        <RecortarFoto archivo={archivoFoto} onCancelar={() => setArchivoFoto(null)} onListo={guardarFoto} />
      )}
    </div>
  );
}

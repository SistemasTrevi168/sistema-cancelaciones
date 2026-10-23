import { useEffect, useState } from 'react';
import {
  ArrowLeft, Check, KeyRound, Laptop, LifeBuoy, Loader2, LogOut, Monitor, Moon, Palette, Power, RefreshCw, ShieldCheck, Smartphone, Sun, UserRound,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import { COLORES_ACENTO, COLOR_ACENTO_DEFECTO, colorLegible } from '../colores';
import Avatar from './Avatar';

// Perfil de otro usuario, como lo ve él en "Mi perfil" (solo el administrador; solo lectura,
// salvo cerrarle sesiones y las acciones de contraseña / activar que ya existen en Usuarios).

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (iso) => {
  if (!iso) return '—';
  const [f, h] = iso.split(' ');
  const [a, m, d] = f.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}${h ? `, ${h}` : ''}`;
};
const TEMAS = { claro: { nombre: 'Claro', icono: Sun }, oscuro: { nombre: 'Oscuro', icono: Moon }, sistema: { nombre: 'Automático (igual que su computadora)', icono: Monitor } };
const ROLES = { admin: 'Administrador', operador: 'Operador', revisor: 'Revisor' };

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

export default function PerfilUsuario({ usuario, onVolver }) {
  const { theme, currentUser, usuariosLista, setModalPassword, puedeServidor, handleCambiarActivo } = useApp();
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState('');
  // Los datos de la lista (activo, rol...) se actualizan solos si se cambian desde aquí
  const fila = usuariosLista.find((u) => u.id === usuario.id) || usuario;
  const esYo = fila.username === currentUser?.username;
  const esAdmin = fila.es_admin || fila.username === 'admin';
  const activo = fila.activo !== false;

  const [version, setVersion] = useState(0);
  const cargar = () => setVersion((v) => v + 1);
  useEffect(() => {
    let vivo = true;
    api.get(`/admin/usuarios/${usuario.id}/perfil`)
      .then((res) => { if (vivo) { setPerfil(res.data); setError(''); } })
      .catch((err) => {
        if (vivo) setError(err.response?.status === 404 ? 'Este servidor todavía no permite ver perfiles (falta subir la actualización) o el usuario ya no existe.' : 'No se pudo cargar el perfil.');
      });
    return () => { vivo = false; };
  }, [usuario.id, version]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [usuario.id]);

  const nombre = perfil?.nombre_mostrar || fila.nombre_mostrar || fila.username;
  const color = colorLegible(perfil?.color_acento || COLOR_ACENTO_DEFECTO);
  const colorNombre = COLORES_ACENTO.find((c) => c.valor === (perfil?.color_acento || COLOR_ACENTO_DEFECTO))?.nombre || 'Personalizado';
  const tema = TEMAS[perfil?.tema] || null;
  const resumen = perfil?.resumen;
  const maxDia = Math.max(1, ...(resumen?.ultimos_14_dias || []).map((d) => d.total));
  const sesiones = perfil?.sesiones || [];
  const cerrables = sesiones.filter((s) => !s.actual).length;
  const boton = { backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border };

  const cerrarSesion = async (s) => {
    if (!(await confirmar(`${nombre} tendrá que volver a entrar en ${s.dispositivo}.`, { titulo: '¿Cerrar esta sesión?', textoConfirmar: 'Cerrar sesión', peligro: true }))) return;
    setCerrando(s.id);
    try {
      const res = await api.delete(`/admin/usuarios/${usuario.id}/sesiones/${s.id}`);
      setPerfil(res.data);
      avisar.exito(`Se cerró la sesión de ${nombre} en ${s.dispositivo}.`);
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo cerrar esa sesión.');
    } finally {
      setCerrando('');
    }
  };
  const cerrarTodas = async () => {
    if (!(await confirmar(`${nombre} tendrá que volver a iniciar sesión en todos sus dispositivos.`, { titulo: '¿Cerrar todas sus sesiones?', textoConfirmar: 'Cerrar todas', peligro: true }))) return;
    setCerrando('todas');
    try {
      const res = await api.post(`/admin/usuarios/${usuario.id}/sesiones/cerrar-todas`);
      setPerfil(res.data);
      avisar.exito(`Se cerraron las sesiones de ${nombre}.`);
    } catch {
      avisar.error('No se pudieron cerrar las sesiones.');
    } finally {
      setCerrando('');
    }
  };

  return (
    <div className="perfil perfil-ajeno">
      <div className="perfil-ajeno-barra">
        <button type="button" className="boton-barra" onClick={onVolver} style={boton}><ArrowLeft size={15} /> Volver a Usuarios</button>
        <span className="perfil-ajeno-aviso" style={{ color: theme.textSecondary }}><UserRound size={14} /> Estás viendo el perfil de <strong style={{ color: theme.textPrimary }}>{nombre}</strong> como administrador</span>
        <button type="button" className="boton-barra" onClick={cargar} title="Actualizar" aria-label="Actualizar" style={boton}><RefreshCw size={14} /></button>
      </div>

      {error && <div className="perfil-ajeno-error" style={{ borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.cardBg }}>{error}</div>}

      {/* Tarjeta principal: con su portada y su color */}
      <section className="perfil-portada" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
        <div
          className={`perfil-franja${perfil?.portada ? ' con-portada' : ''}`}
          style={perfil?.portada
            ? { backgroundImage: `url(${perfil.portada})`, backgroundPosition: `center ${perfil.portada_pos ?? 50}%` }
            : { background: `linear-gradient(120deg, ${color}, ${color}99)` }}
        />
        <div className="perfil-portada-contenido perfil-ajeno-contenido">
          <div className="perfil-foto">
            <Avatar usuario={{ ...fila, foto: perfil ? perfil.foto : fila.foto, nombre_mostrar: nombre }} tam={112} color={color} borde={theme.cardBg} />
          </div>
          <div className="perfil-identidad">
            <h3 style={{ color: theme.textPrimary }}>{nombre}{esYo && <span style={{ fontWeight: 500, color: theme.textSecondary }}> (tú)</span>}</h3>
            <p style={{ color: theme.textSecondary }}>
              @{fila.username} · {ROLES[perfil?.rol || fila.rol] || (esAdmin ? 'Administrador' : 'Operador')}
              {perfil?.creado_en ? ` · desde ${fechaCorta(perfil.creado_en.slice(0, 10))}` : ''}
            </p>
            <div className="perfil-ajeno-chips">
              <span style={{ backgroundColor: activo ? '#dcfce7' : '#f1f5f9', color: activo ? '#166534' : '#475569' }}>{activo ? 'Activo' : 'Inactivo'}</span>
              {fila.debe_cambiar_password && <span style={{ backgroundColor: '#ecfeff', color: '#0e7490' }}>Contraseña temporal</span>}
              {perfil && <span style={{ backgroundColor: theme.subtleBg, color: theme.textSecondary }}>{sesiones.length} {sesiones.length === 1 ? 'sesión abierta' : 'sesiones abiertas'}</span>}
            </div>
          </div>
          {!esYo && (
            <div className="perfil-ajeno-acciones">
              <button type="button" className="boton-barra" onClick={() => setModalPassword({ modo: 'reset', usuario: fila })} style={boton}><KeyRound size={14} color={theme.accent} /> Cambiar contraseña</button>
              {puedeServidor('restablecer_password') && (
                <button type="button" className="boton-barra" onClick={() => setModalPassword({ modo: 'restablecer', usuario: fila })} style={boton}><LifeBuoy size={14} color="#0891b2" /> Restablecer contraseña</button>
              )}
              {!esAdmin && (
                <button type="button" className="boton-barra" onClick={async () => { await handleCambiarActivo(fila); cargar(); }} style={boton}>
                  <Power size={14} color={activo ? '#d97706' : '#16a34a'} /> {activo ? 'Desactivar' : 'Activar'}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="perfil-columnas">
        <Seccion icono={Check} titulo="Su resumen" theme={theme}>
          {!resumen ? (
            <div className="perfil-cargando" style={{ color: theme.textSecondary }}>{error ? '—' : <><Loader2 size={16} className="girando" /> Cargando…</>}</div>
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
                    <div style={{ height: `${(d.total / maxDia) * 100}%`, backgroundColor: color }} />
                  </div>
                ))}
              </div>
              <p className="perfil-nota" style={{ color: theme.textSecondary }}>
                Últimos 14 días · último expediente: <strong style={{ color: theme.textPrimary }}>{resumen.ultimo_expediente ? fechaCorta(resumen.ultimo_expediente) : 'todavía ninguno'}</strong>
              </p>
            </>
          )}
        </Seccion>

        <Seccion icono={Palette} titulo="Apariencia" theme={theme}>
          <p className="perfil-etiqueta" style={{ color: theme.textSecondary }}>Color del sistema</p>
          <div className="perfil-ajeno-dato" style={{ color: theme.textPrimary }}>
            <span className="perfil-ajeno-muestra" style={{ backgroundColor: color }} /> {perfil ? `${colorNombre}${perfil.color_acento ? '' : ' (el de siempre)'}` : '…'}
            {perfil?.color_acento && <code style={{ color: theme.textSecondary }}>{perfil.color_acento}</code>}
          </div>
          <p className="perfil-etiqueta" style={{ color: theme.textSecondary }}>Tema</p>
          <div className="perfil-ajeno-dato" style={{ color: theme.textPrimary }}>
            {tema ? <><tema.icono size={16} color={theme.textSecondary} /> {tema.nombre}</> : (perfil ? 'Sin elegir (claro)' : '…')}
          </div>
          <p className="perfil-nota" style={{ color: theme.textSecondary }}>Así ve {nombre} el sistema. Solo cada quien puede cambiar su foto, portada, nombre, color y tema.</p>
        </Seccion>
      </div>

      <Seccion
        icono={ShieldCheck}
        titulo="Seguridad"
        theme={theme}
        accion={cerrables > 0 && (
          <button type="button" className="boton-barra" onClick={cerrarTodas} disabled={cerrando === 'todas'} style={{ ...boton, color: '#dc2626' }}>
            {cerrando === 'todas' ? <Loader2 size={14} className="girando" /> : <LogOut size={14} />} Cerrar todas sus sesiones
          </button>
        )}
      >
        <p className="perfil-etiqueta" style={{ color: theme.textSecondary, margin: '0 0 8px' }}>Sesiones abiertas ({perfil ? sesiones.length : '…'})</p>
        {perfil && sesiones.length === 0 && <p className="perfil-nota" style={{ color: theme.textSecondary }}>No tiene ninguna sesión abierta en este momento.</p>}
        <ul className="perfil-sesiones">
          {sesiones.map((s) => {
            const Icono = /iPhone|Android|iPad/.test(s.dispositivo) ? Smartphone : Laptop;
            return (
              <li key={s.id} style={{ borderColor: theme.border }}>
                <span className="perfil-sesion-icono" style={{ backgroundColor: theme.subtleBg, color: theme.textSecondary }}><Icono size={18} /></span>
                <span className="perfil-sesion-datos">
                  <strong style={{ color: theme.textPrimary }}>
                    {s.dispositivo}
                    {s.actual && <span className="perfil-chip" style={{ backgroundColor: `${theme.accent}1f`, color: theme.accent }}>Tu sesión actual</span>}
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
        <p className="perfil-nota" style={{ color: theme.textSecondary }}>Si ves un dispositivo que no reconoce, cierra esa sesión y restablécele la contraseña.</p>
      </Seccion>
    </div>
  );
}

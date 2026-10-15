// Foto de perfil o, si no hay, la inicial del nombre sobre el color del sistema
export default function Avatar({ usuario, tam = 36, color = '#2563eb', borde }) {
  const nombre = usuario?.nombre_mostrar || usuario?.username || '';
  const iniciales = nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
  const estilo = {
    width: `${tam}px`,
    height: `${tam}px`,
    borderRadius: '50%',
    flexShrink: 0,
    boxShadow: borde ? `0 0 0 2px ${borde}` : undefined,
  };
  if (usuario?.foto) {
    return <img src={usuario.foto} alt={`Foto de ${nombre}`} className="avatar" style={{ ...estilo, objectFit: 'cover', display: 'block' }} />;
  }
  return (
    <div
      className="avatar"
      aria-label={nombre}
      style={{ ...estilo, backgroundColor: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: `${Math.round(tam * 0.38)}px` }}
    >
      {iniciales}
    </div>
  );
}

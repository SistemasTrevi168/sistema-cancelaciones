import { TIPOS_ARCHIVO } from '../tiposArchivo';
// Ícono de tipo de archivo (hoja con esquina doblada y etiqueta de color según el formato)


export default function IconoArchivo({ tipo = 'txt', size = 20, title }) {
  const t = TIPOS_ARCHIVO[tipo] || TIPOS_ARCHIVO.txt;
  const ancho = size * 0.82;
  return (
    <svg
      width={ancho}
      height={size}
      viewBox="0 0 32 40"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}
    >
      {title && <title>{title}</title>}
      {/* hoja */}
      <path d="M4 1h17l10 10v26a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="#fff" stroke={t.color} strokeWidth="2" />
      {/* esquina doblada */}
      <path d="M21 1v8a2 2 0 0 0 2 2h8" fill={`${t.color}22`} stroke={t.color} strokeWidth="2" strokeLinejoin="round" />
      {/* líneas de texto */}
      <path d="M7 15h12M7 19h18" stroke={`${t.color}66`} strokeWidth="2" strokeLinecap="round" />
      {/* etiqueta del formato */}
      <rect x="0" y="23" width="32" height="13" rx="2.5" fill={t.color} />
      <text x="16" y="32.6" textAnchor="middle" fontSize={t.texto.length > 3 ? 8.6 : 10} fontWeight="800" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif" letterSpacing="0.3">
        {t.texto}
      </text>
    </svg>
  );
}

import { FileText } from 'lucide-react';

// Pantalla de presentación: se muestra al verificar la sesión y justo después de iniciar sesión.
// Usa el color que eligió el usuario que entra (variable --acento).
export default function PantallaCarga({ nombre, isDarkMode, saliendo = false }) {
  const saludo = nombre ? `Bienvenido, ${nombre}` : 'Verificando sesión…';
  return (
    <div
      className={`pantalla-carga ${saliendo ? 'pantalla-carga-salida' : ''}`}
      role="status"
      aria-live="polite"
      style={{
        background: isDarkMode
          ? 'radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--acento, #2563eb) 45%, #0b0f19) 0%, #0b0f19 55%)'
          : 'radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--acento, #2563eb) 18%, white) 0%, #f8fafc 55%)',
      }}
    >
      <span className="burbuja burbuja-1" />
      <span className="burbuja burbuja-2" />
      <span className="burbuja burbuja-3" />

      <div className="pantalla-carga-contenido">
        <div className="logo-carga">
          <span className="anillo anillo-1" />
          <span className="anillo anillo-2" />
          <div className="logo-carga-icono">
            <FileText size={38} color="#fff" strokeWidth={2.2} />
          </div>
        </div>

        <h1 className="titulo-carga" style={{ color: isDarkMode ? '#f8fafc' : '#0f172a' }}>
          Cancelación de Hipotecas
        </h1>
        <p className="saludo-carga" style={{ color: isDarkMode ? 'color-mix(in srgb, var(--acento, #2563eb) 55%, white)' : 'var(--acento, #2563eb)' }}>{saludo}</p>

        <div className="barra-carga" style={{ backgroundColor: isDarkMode ? 'rgba(148,163,184,0.2)' : 'color-mix(in srgb, var(--acento, #2563eb) 14%, transparent)' }}>
          <span className={nombre ? 'barra-carga-llenado' : 'barra-carga-indeterminada'} />
        </div>
        <p className="texto-carga" style={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
          {nombre ? 'Preparando tu espacio de trabajo…' : 'Un momento, por favor'}
        </p>
      </div>
    </div>
  );
}

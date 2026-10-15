import { useRef, useState } from 'react';
import { FileText, FolderOpen, ScrollText, X } from 'lucide-react';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';

const TIPOS = {
  carta: { titulo: 'Carta de instrucción', icono: ScrollText, color: '#2563eb' },
  constancia: { titulo: 'Constancia de folio', icono: FileText, color: '#7c3aed' },
};

// Recuadro para subir un tipo de documento (carta o constancia).
// varios=false: un solo PDF (caso individual). varios=true: varios PDF o carpetas (carga masiva).
export default function ZonaArchivos({ tipo, archivos, varios = false, onElegir, onSoltar, onQuitar, ayuda, conflicto = false }) {
  const { theme } = useApp();
  const [encima, setEncima] = useState(false);
  const archivoRef = useRef(null);
  const carpetaRef = useRef(null);
  const info = TIPOS[tipo];
  const Icono = info.icono;
  const lista = archivos || [];
  const hay = lista.length > 0;

  const alElegir = (e) => {
    onElegir(Array.from(e.target.files || []));
    e.target.value = '';
  };

  return (
    <div
      className={`zona-tipo ${encima ? 'encima' : ''} ${hay ? 'con-archivos' : ''} ${conflicto ? 'en-conflicto' : ''}`}
      style={{ borderColor: conflicto ? '#dc2626' : (encima ? info.color : (hay ? info.color + '80' : theme.dropzoneBorder)), backgroundColor: theme.dropzoneBg }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setEncima(true); }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => { setEncima(false); onSoltar(e); }}
    >
      <div className="zona-tipo-encabezado">
        <span className="zona-tipo-icono" style={{ backgroundColor: info.color + '18', color: info.color }}><Icono size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="zona-tipo-titulo" style={{ color: theme.textPrimary }}>{varios ? `${info.titulo.replace('Carta', 'Cartas').replace('Constancia', 'Constancias')}` : info.titulo}</div>
          <div className="zona-tipo-ayuda" style={{ color: theme.textSecondary }}>
            {ayuda || (varios ? 'Arrastra aquí los PDF o una carpeta' : 'Arrastra aquí el PDF')}
          </div>
        </div>
        {hay && varios && <span className="chip-dato" style={{ borderColor: info.color + '60', color: info.color, backgroundColor: theme.cardBg }}>{lista.length}</span>}
      </div>

      {hay && (
        <ul className="zona-tipo-lista">
          {lista.map((f, i) => (
            <li key={`${f.name}-${i}`} style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
              <IconoArchivo tipo="pdf" size={16} />
              <span title={f.webkitRelativePath || f.name}>{f.name}</span>
              <small style={{ color: theme.textSecondary }}>{Math.max(1, Math.round(f.size / 1024))} KB</small>
              <button type="button" className="quitar-archivo" title={`Quitar ${f.name}`} onClick={() => onQuitar(f)}><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="zona-tipo-botones">
        <input ref={archivoRef} type="file" accept=".pdf" multiple={varios} onChange={alElegir} style={{ display: 'none' }} id={`archivo-${tipo}${varios ? '-lote' : ''}`} />
        <button type="button" className="boton-barra" onClick={() => archivoRef.current?.click()} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
          <FileText size={14} color={info.color} /> {hay && !varios ? 'Cambiar archivo' : (varios ? 'Elegir archivos' : 'Elegir archivo')}
        </button>
        {varios && (
          <>
            <input ref={carpetaRef} type="file" multiple webkitdirectory="true" onChange={alElegir} style={{ display: 'none' }} id={`carpeta-${tipo}-lote`} />
            <button type="button" className="boton-barra" onClick={() => carpetaRef.current?.click()} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
              <FolderOpen size={14} color={info.color} /> Elegir carpeta
            </button>
            {hay && (
              <button type="button" className="enlace-pequeno" onClick={() => onQuitar(null)} style={{ marginLeft: 'auto' }}>Quitar todos</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

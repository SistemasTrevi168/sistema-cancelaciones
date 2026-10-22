import { useRef, useState } from 'react';
import { AlertTriangle, FileText, FolderOpen, ScrollText, Search, X } from 'lucide-react';
import { useApp } from '../AppContext';
import IconoArchivo from './IconoArchivo';

const TIPOS = {
  carta: { titulo: 'Carta de instrucción', icono: ScrollText, color: '#2563eb' },
  constancia: { titulo: 'Constancia de folio', icono: FileText, color: '#7c3aed' },
  carta2: { titulo: 'Carta de instrucción · trabajador dos', icono: ScrollText, color: '#0891b2' },
};

// Recuadro para subir un tipo de documento (carta o constancia).
// varios=false: un solo PDF (caso individual). varios=true: varios PDF o carpetas (carga masiva).
// sinPareja: nombres de archivos de este recuadro que no tienen su pareja (mismo número) en el otro.
export default function ZonaArchivos({ tipo, archivos, varios = false, onElegir, onSoltar, onQuitar, ayuda, conflicto = false, titulo = '', sinPareja = null }) {
  const { theme } = useApp();
  const [encima, setEncima] = useState(false);
  const archivoRef = useRef(null);
  const carpetaRef = useRef(null);
  const info = TIPOS[tipo];
  const Icono = info.icono;
  const lista = archivos || [];
  const hay = lista.length > 0;
  // Buscador (carga masiva): por nombre, y para ver solo los que no tienen pareja
  const [busca, setBusca] = useState('');
  const [soloSinPareja, setSoloSinPareja] = useState(false);
  const huerfanos = sinPareja instanceof Set ? sinPareja : new Set(sinPareja || []);
  const nHuerfanos = lista.filter((f) => huerfanos.has(f.name)).length;
  const conBuscador = varios && lista.length > 0;
  const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const filtroActivo = busca.trim() || (soloSinPareja && nHuerfanos > 0);
  const visibles = !conBuscador ? lista : lista.filter((f) => (!soloSinPareja || nHuerfanos === 0 || huerfanos.has(f.name))
    && (!busca.trim() || normal(f.name).includes(normal(busca))));

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
          <div className="zona-tipo-titulo" style={{ color: theme.textPrimary }}>{titulo || (varios ? `${info.titulo.replace('Carta', 'Cartas').replace('Constancia', 'Constancias')}` : info.titulo)}</div>
          <div className="zona-tipo-ayuda" style={{ color: theme.textSecondary }}>
            {ayuda || (varios ? 'Arrastra aquí los PDF o una carpeta' : 'Arrastra aquí el PDF')}
          </div>
        </div>
        {hay && varios && <span className="chip-dato" style={{ borderColor: info.color + '60', color: info.color, backgroundColor: theme.cardBg }}>{lista.length}</span>}
      </div>

      {conBuscador && (
        <div className="zona-buscador" onDragOver={(e) => e.stopPropagation()}>
          <label className="zona-buscador-campo" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
            <Search size={14} color={theme.textSecondary} />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar archivo por nombre o número…"
              aria-label={`Buscar en ${info.titulo}`}
              style={{ color: theme.textPrimary }}
            />
            {busca && <button type="button" className="quitar-archivo" onClick={() => setBusca('')} aria-label="Limpiar búsqueda"><X size={13} /></button>}
          </label>
          {nHuerfanos > 0 && (
            <button type="button" className={`chip-sin-pareja ${soloSinPareja ? 'activo' : ''}`} onClick={() => setSoloSinPareja((v) => !v)}
              title="Ver solo los archivos que no tienen su pareja (mismo número) en el otro recuadro">
              <AlertTriangle size={12} /> Sin pareja ({nHuerfanos})
            </button>
          )}
        </div>
      )}
      {conBuscador && filtroActivo && (
        <div className="zona-buscador-resumen" style={{ color: theme.textSecondary }}>
          {visibles.length === 0 ? 'Ningún archivo coincide.' : `Mostrando ${visibles.length} de ${lista.length}`}
          {soloSinPareja && visibles.length > 1 && (
            <button type="button" className="enlace-pequeno" onClick={() => { visibles.forEach((f) => onQuitar(f)); setSoloSinPareja(false); }}>
              Quitar estos {visibles.length}
            </button>
          )}
        </div>
      )}

      {hay && visibles.length > 0 && (
        <ul className="zona-tipo-lista">
          {visibles.map((f, i) => (
            <li key={`${f.name}-${i}`} className={huerfanos.has(f.name) ? 'sin-pareja' : ''} style={{ backgroundColor: theme.cardBg, borderColor: huerfanos.has(f.name) ? '#f59e0b' : theme.border, color: theme.textPrimary }}>
              <IconoArchivo tipo="pdf" size={16} />
              <span title={f.webkitRelativePath || f.name}>{f.name}</span>
              {huerfanos.has(f.name) && <em className="etiqueta-sin-pareja" title="No hay un archivo con el mismo número en el otro recuadro">sin pareja</em>}
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

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, FileStack, Loader2, Search, Upload, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../AppContext';
import { avisar, confirmar } from '../ui/notificaciones';
import { creditoDeNombre } from '../ui/usarYaGenerados';
import ZonaArchivos from './ZonaArchivos';

const esPdf = (f) => /\.pdf$/i.test(f?.name || '');
const TIPO_TXT = { carta: 'Carta', carta2: 'Carta 2', constancia: 'Constancia' };
// Dos cartas del mismo crédito (coacreditados): la que dice "_2" (o va después) es la del trabajador dos
const ordenarCartas = (lista) => [...lista].sort((a, b) => {
  const dos = (f) => (/(?:[_\s-]|\()2\)?\.pdf$/i.test(f.name) ? 1 : 0);
  return dos(a) - dos(b) || a.name.localeCompare(b.name);
});

// Subir los PDF de expedientes que se guardaron antes de que el sistema guardara los PDF.
// Se eligen la carpeta de cartas y la de constancias; se juntan con cada expediente por el número de crédito.
// Solo se guardan los PDF: no se vuelven a leer ni se cambian los datos, el estado ni el Word.
export default function ModalCompletarPdfs({ onCerrar }) {
  const { theme, isDarkMode, pdfsDeSoltar } = useApp();
  const [cartas, setCartas] = useState([]);
  const [constancias, setConstancias] = useState([]);
  const [revision, setRevision] = useState(null); // { expedientes: [...] } del servidor
  const [revisando, setRevisando] = useState(false);
  const [reemplazar, setReemplazar] = useState(false);
  const [subiendo, setSubiendo] = useState(null); // { hechos, total }
  const [resultado, setResultado] = useState(null);
  const [saliendo, setSaliendo] = useState(false);
  const [busca, setBusca] = useState('');

  const cerrar = () => {
    if (subiendo) return;
    setSaliendo(true);
    setTimeout(() => onCerrar?.(), 160);
  };
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agregar = (fijar) => (fs) => {
    const pdfs = Array.from(fs || []).filter(esPdf);
    fijar((prev) => {
      const ya = new Set(prev.map((f) => `${f.name}|${f.size}`));
      return [...prev, ...pdfs.filter((f) => !ya.has(`${f.name}|${f.size}`))];
    });
    setRevision(null); setResultado(null);
  };
  const quitar = (fijar) => (f) => { fijar((prev) => (f ? prev.filter((x) => x !== f) : [])); setRevision(null); setResultado(null); };

  // Archivos por crédito
  const porCredito = useMemo(() => {
    const m = {};
    cartas.forEach((f) => { const c = creditoDeNombre(f.name); if (c) (m[c] ||= { cartas: [], constancias: [] }).cartas.push(f); });
    constancias.forEach((f) => { const c = creditoDeNombre(f.name); if (c) (m[c] ||= { cartas: [], constancias: [] }).constancias.push(f); });
    return m;
  }, [cartas, constancias]);
  const sinNumero = [...cartas, ...constancias].filter((f) => !creditoDeNombre(f.name));

  const revisar = async () => {
    const creditos = Object.keys(porCredito);
    if (!creditos.length) { avisar.aviso('Ningún archivo trae el número de crédito en su nombre.'); return; }
    setRevisando(true);
    try {
      setRevision((await api.post('/documentos/emparejar', { creditos })).data);
    } catch (e) {
      avisar.error(`No se pudo revisar: ${e.response?.data?.detail || e.message}`);
    } finally {
      setRevisando(false);
    }
  };

  // Qué se sube a cada expediente
  const plan = useMemo(() => {
    if (!revision) return null;
    const porCred = {};
    (revision.expedientes || []).forEach((e) => { (porCred[e.credito] ||= []).push(e); });
    const filas = [];
    Object.entries(porCredito).forEach(([credito, a]) => {
      const exps = porCred[credito] || [];
      const cartasOrd = ordenarCartas(a.cartas);
      const pares = [];
      if (cartasOrd[0]) pares.push([cartasOrd[0], 'carta']);
      if (cartasOrd[1]) pares.push([cartasOrd[1], 'carta2']);
      if (a.constancias[0]) pares.push([a.constancias[0], 'constancia']);
      if (!exps.length) { filas.push({ credito, exp: null, subir: [], omitir: pares, motivo: 'sin expediente' }); return; }
      exps.forEach((exp) => {
        const subir = pares.filter(([, t]) => reemplazar || !exp.tiene.includes(t));
        const omitir = pares.filter(([, t]) => !reemplazar && exp.tiene.includes(t));
        filas.push({ credito, exp, subir, omitir, motivo: omitir.length ? 'ya tenía' : '' });
      });
    });
    return filas.sort((x, y) => (!!y.exp - !!x.exp) || (y.subir.length - x.subir.length) || x.credito.localeCompare(y.credito));
  }, [revision, porCredito, reemplazar]);

  const totalSubir = plan ? plan.reduce((n, f) => n + f.subir.length, 0) : 0;
  const expsSubir = plan ? plan.filter((f) => f.subir.length).length : 0;
  const sinExp = plan ? plan.filter((f) => !f.exp).length : 0;
  const yaTenian = plan ? plan.filter((f) => f.exp && !f.subir.length).length : 0;
  const repetidos = plan ? new Set(plan.filter((f) => f.exp).map((f) => f.credito)).size !== plan.filter((f) => f.exp).length : false;

  const subirTodo = async () => {
    const trabajo = plan.filter((f) => f.subir.length);
    if (!trabajo.length) return;
    if (reemplazar && !(await confirmar(`Se van a reemplazar los PDF que ya tenían algunos expedientes por los que elegiste. ¿Continuar?`, { titulo: 'Reemplazar PDF', textoConfirmar: 'Sí, reemplazar' }))) return;
    setSubiendo({ hechos: 0, total: trabajo.length });
    let ok = 0; let archivos = 0; const fallas = [];
    for (let i = 0; i < trabajo.length; i += 1) {
      const f = trabajo[i];
      const fd = new FormData();
      f.subir.forEach(([file, t]) => { fd.append('archivos', file); fd.append('tipos', t); });
      fd.append('solo_si_falta', reemplazar ? 'false' : 'true');
      try {
        const r = await api.post(`/expedientes/${f.exp.id}/documentos`, fd);
        ok += 1; archivos += (r.data?.guardados || []).length;
      } catch (e) {
        fallas.push(`${f.credito}: ${e.response?.data?.detail || e.message}`);
      }
      setSubiendo({ hechos: i + 1, total: trabajo.length });
    }
    setSubiendo(null);
    setResultado({ ok, archivos, fallas });
    if (!fallas.length) avisar.exito(`Listo: se guardaron ${archivos} PDF en ${ok} expediente(s).`);
    else avisar.aviso(`Se guardaron ${archivos} PDF; ${fallas.length} expediente(s) tuvieron problema.`);
  };

  const filasVisibles = (plan || []).filter((f) => !busca.trim()
    || `${f.credito} ${f.exp?.acreditado || ''}`.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <div className={`fondo-modal ${saliendo ? 'saliendo' : ''}`} onClick={cerrar} role="dialog" aria-modal="true" aria-labelledby="completar-titulo">
      <div className={`modal-compartir modal-completar ${saliendo ? 'modal-salida' : 'modal-entrada'}`} onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}>
        <header className="modal-compartir-encabezado" style={{ borderColor: theme.border }}>
          <span className="modal-compartir-icono" style={{ backgroundColor: '#0891b21a', color: '#0891b2' }}><FileStack size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="completar-titulo">Subir PDF de expedientes anteriores</h3>
            <small style={{ color: theme.textSecondary }}>Solo se guardan los PDF: los datos, el estado y el Word no cambian.</small>
          </div>
          <button type="button" className="bitacora-cerrar" onClick={cerrar} aria-label="Cerrar" disabled={!!subiendo} style={{ color: theme.textSecondary }}><X size={20} /></button>
        </header>

        <div className="modal-completar-cuerpo">
          <p className="modal-compartir-texto" style={{ color: theme.textSecondary, margin: '0 0 12px' }}>
            Elige la carpeta de <strong>cartas</strong> y la de <strong>constancias</strong> (o arrástralas). Cada PDF se junta con su expediente por el
            <strong> número de crédito del nombre del archivo</strong>, igual que en la Carga Masiva. Antes de subir verás el resumen.
          </p>
          <div className="zonas-tipo">
            <ZonaArchivos tipo="carta" varios archivos={cartas} onElegir={agregar(setCartas)} onSoltar={async (e) => { e.preventDefault(); agregar(setCartas)(await pdfsDeSoltar(e)); }}
              onQuitar={quitar(setCartas)} ayuda="Carpeta o PDF sueltos de cartas" />
            <ZonaArchivos tipo="constancia" varios archivos={constancias} onElegir={agregar(setConstancias)} onSoltar={async (e) => { e.preventDefault(); agregar(setConstancias)(await pdfsDeSoltar(e)); }}
              onQuitar={quitar(setConstancias)} ayuda="Carpeta o PDF sueltos de constancias" />
          </div>
          {sinNumero.length > 0 && (
            <p className="completar-aviso"><AlertTriangle size={14} /> {sinNumero.length} archivo(s) no traen número de crédito en el nombre y no se pueden juntar: {sinNumero.slice(0, 3).map((f) => f.name).join(', ')}{sinNumero.length > 3 ? '…' : ''}</p>
          )}

          {plan && (
            <div className="completar-resumen fade-in">
              <div className="completar-chips">
                <span className="chip-dato chip-ok"><CheckCircle size={12} /> {totalSubir} PDF a {expsSubir} expediente(s)</span>
                {yaTenian > 0 && <span className="chip-dato" style={{ borderColor: theme.border, color: theme.textSecondary }}>{yaTenian} ya tenían sus PDF</span>}
                {sinExp > 0 && <span className="chip-dato chip-falta"><AlertTriangle size={12} /> {sinExp} crédito(s) sin expediente</span>}
                <label className="completar-reemplazar" style={{ color: theme.textSecondary }}>
                  <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} disabled={!!subiendo} /> Reemplazar los que ya tienen PDF
                </label>
              </div>
              {repetidos && <p className="completar-aviso" style={{ color: theme.textSecondary }}>Hay créditos con más de un expediente guardado: sus PDF se guardan en todos.</p>}
              <label className="zona-buscador-campo" style={{ borderColor: theme.border, backgroundColor: theme.inputBg, marginBottom: 8 }}>
                <Search size={14} color={theme.textSecondary} />
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar crédito o acreditado…" style={{ color: theme.textPrimary }} />
              </label>
              <div className="completar-tabla" style={{ borderColor: theme.border }}>
                {filasVisibles.slice(0, 300).map((f) => (
                  <div key={`${f.credito}-${f.exp?.id || 'x'}`} className={`completar-fila ${f.exp ? '' : 'sin-exp'}`} style={{ borderColor: theme.border }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong>{f.credito}</strong> <span style={{ color: theme.textSecondary }}>{f.exp ? `· ${f.exp.acreditado || 'Sin nombre'} · ${f.exp.propietario}` : '· no hay expediente con este crédito'}</span>
                    </div>
                    <div className="completar-tipos">
                      {f.subir.map(([, t]) => <span key={`s${t}`} className="tipo-pdf subir">{TIPO_TXT[t]}</span>)}
                      {f.omitir.map(([, t]) => <span key={`o${t}`} className="tipo-pdf omitir" title={f.exp ? 'Ya tenía este PDF: se deja el que estaba' : 'No se sube'}>{TIPO_TXT[t]}</span>)}
                    </div>
                  </div>
                ))}
                {filasVisibles.length > 300 && <div className="completar-fila" style={{ color: theme.textSecondary }}>y {filasVisibles.length - 300} más…</div>}
              </div>
            </div>
          )}

          {subiendo && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
                <span>Subiendo PDF… no cierres esta ventana</span><span>{subiendo.hechos} de {subiendo.total}</span>
              </div>
              <div className="barra-progreso" style={{ backgroundColor: theme.subtleBg }}>
                <div style={{ width: `${Math.round((subiendo.hechos / subiendo.total) * 100)}%`, backgroundColor: theme.accent }} />
              </div>
            </div>
          )}
          {resultado && (
            <div className="completar-resultado" style={{ backgroundColor: isDarkMode ? '#052e16' : '#ecfdf5', color: isDarkMode ? '#86efac' : '#065f46', borderColor: isDarkMode ? '#166534' : '#a7f3d0' }}>
              <CheckCircle size={16} /> Se guardaron {resultado.archivos} PDF en {resultado.ok} expediente(s). Ya puedes editarlos con todo completo.
              {resultado.fallas.length > 0 && <div style={{ color: '#b91c1c', marginTop: 4 }}>Con problema: {resultado.fallas.slice(0, 3).join(' · ')}</div>}
            </div>
          )}
        </div>

        <footer className="modal-compartir-pie" style={{ borderColor: theme.border }}>
          <small style={{ color: theme.textSecondary }}>{cartas.length} carta(s) · {constancias.length} constancia(s)</small>
          <button type="button" className="boton-barra" onClick={cerrar} disabled={!!subiendo} style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!plan ? (
            <button type="button" className="boton-barra" onClick={revisar} disabled={revisando || (!cartas.length && !constancias.length)} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
              {revisando ? <Loader2 size={15} className="girando" /> : <Search size={15} />} Revisar
            </button>
          ) : (
            <button type="button" className="boton-barra" onClick={subirTodo} disabled={!!subiendo || totalSubir === 0 || !!resultado} style={{ backgroundColor: theme.accent, color: '#fff', borderColor: theme.accent }}>
              {subiendo ? <Loader2 size={15} className="girando" /> : <Upload size={15} />} {resultado ? 'Listo' : `Subir ${totalSubir} PDF`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

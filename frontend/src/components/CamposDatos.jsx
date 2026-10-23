import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, Lock, Pencil, Unlock } from 'lucide-react';
import { useApp } from '../AppContext';
import { CAMPOS_LARGOS, agruparDatos, esPuntoInmueble, etiquetaDe } from '../camposExpediente';
import { esDatoVacio } from '../datosFaltantes';
import { esFecha, formatoAlSalir } from '../ui/conversiones';

// Lista de datos de un expediente, agrupada y editable.
// prefijo: identifica los candados de este expediente (ej. 'single' o 'batch_3').
// plegables: los grupos se pueden plegar y los que están completos empiezan plegados (espacio de trabajo).
// enfocar: { clave, t } para abrir el grupo de ese dato y llevar la vista hasta él.
export default function CamposDatos({ datos, prefijo, faltantes = [], onCambio, compacto = false, coac = false, plegables = false, enfocar = null }) {
  const { theme, isDarkMode, unlockedFields, setUnlockedFields, handleToggleUnlock, normalizarCampo } = useApp();

  // Al cambiar un número se rehacen sus letras dentro del mismo campo: el cursor se queda donde estaba
  const cursor = useRef(null);
  useLayoutEffect(() => {
    const c = cursor.current;
    if (!c) return;
    cursor.current = null;
    const el = document.getElementById(c.id);
    if (el && document.activeElement === el && el.selectionStart !== c.pos) el.setSelectionRange(c.pos, c.pos);
  });
  const cambiar = (clave, e) => {
    cursor.current = { id: e.target.id, pos: e.target.selectionStart };
    onCambio(clave, e.target.value);
  };
  // Al salir del campo, un número escrito solo se pasa a su formato con letra (como lo hace la lectura de los PDF)
  const alSalir = async (clave, e) => {
    const valor = e.target.value;
    if (!/\d/.test(valor)) return;
    const local = formatoAlSalir(clave, valor);
    if (local !== null) { onCambio(clave, local); return; }
    if (esFecha(clave) && normalizarCampo) {
      const { valor: nuevo } = await normalizarCampo(clave, valor);
      // Solo si nadie lo cambió mientras se convertía
      if (nuevo && nuevo !== valor && document.getElementById(e.target.id)?.value === valor) onCambio(clave, nuevo);
    }
  };
  const grupos = agruparDatos(datos, coac);

  const conConyuge = /^s[ií]/i.test(String(datos?.tiene_conyuge || '')) || !esDatoVacio(datos?.nombre_conyuge);
  const esOpcional = (clave) => esPuntoInmueble(clave) || clave === 'tiene_conyuge' || (clave === 'nombre_conyuge' && !conConyuge);
  const esFalta = (clave) => faltantes.includes(clave) || (esDatoVacio(datos?.[clave]) && !esOpcional(clave));
  const faltanDe = (g) => g.campos.filter(esFalta).length;

  // Qué grupos están abiertos. Se decide UNA vez por expediente (no se cierran solos mientras escribes).
  const inicial = () => Object.fromEntries(grupos.map((g) => [g.titulo, g.plegado ? false : (!plegables || faltanDe(g) > 0)]));
  const [estado, setEstado] = useState(() => ({ prefijo, abiertos: inicial() }));
  if (estado.prefijo !== prefijo) setEstado({ prefijo, abiertos: inicial() });
  const abiertos = estado.abiertos;
  const estaAbierto = (g) => (g.titulo in abiertos ? abiertos[g.titulo] : !g.plegado);
  const alternarGrupo = (titulo, valor) => setEstado((e) => ({ ...e, abiertos: { ...e.abiertos, [titulo]: valor } }));
  const todosAbiertos = grupos.every(estaAbierto);
  const abrirTodos = (valor) => setEstado((e) => ({ ...e, abiertos: Object.fromEntries(grupos.map((g) => [g.titulo, valor || (!g.plegado && faltanDe(g) > 0)])) }));

  // Pedido de ir a un dato: abre su grupo y lo lleva a la vista
  const [ultimoPedido, setUltimoPedido] = useState(null);
  if (enfocar && enfocar.t !== ultimoPedido) {
    setUltimoPedido(enfocar.t);
    const g = grupos.find((x) => x.campos.includes(enfocar.clave));
    if (g && !estaAbierto(g)) alternarGrupo(g.titulo, true);
  }
  useEffect(() => {
    if (!enfocar) return undefined;
    const id = setTimeout(() => {
      const el = document.getElementById(`${prefijo}_${enfocar.clave}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('campo-destello');
      void el.offsetWidth;
      el.classList.add('campo-destello');
    }, 60);
    return () => clearTimeout(id);
  }, [enfocar, prefijo]);

  const todasLasClaves = grupos.flatMap((g) => g.campos);
  const todoAbierto = todasLasClaves.length > 0 && todasLasClaves.every((k) => unlockedFields[`${prefijo}_${k}`]);

  const alternarTodos = () => {
    setUnlockedFields((prev) => {
      const nuevo = { ...prev };
      todasLasClaves.forEach((k) => { nuevo[`${prefijo}_${k}`] = !todoAbierto; });
      return nuevo;
    });
  };

  const tam = compacto ? { fuente: '12px', relleno: '8px 10px', boton: '8px', icono: 14 } : { fuente: '13px', relleno: '10px 12px', boton: '10px', icono: 16 };

  const campo = (clave) => {
    // "NO_ENCONTRADO" ya no se muestra: el campo queda vacío y marcado en rojo
    const valor = esDatoVacio(datos[clave]) ? '' : datos[clave];
    const editable = !!unlockedFields[`${prefijo}_${clave}`];
    const falta = esFalta(clave);
    const largo = CAMPOS_LARGOS.has(clave);
    const estilo = {
      flex: 1,
      width: '100%',
      padding: tam.relleno,
      borderRadius: '8px',
      border: `1px solid ${falta ? '#ef4444' : theme.border}`,
      backgroundColor: falta && !editable ? (isDarkMode ? '#450a0a' : '#fef2f2') : (editable ? theme.inputBg : theme.subtleBg),
      color: falta && !editable ? (isDarkMode ? '#fca5a5' : '#b91c1c') : theme.textPrimary,
      fontSize: tam.fuente,
      fontFamily: 'inherit',
      boxSizing: 'border-box',
      resize: 'vertical',
    };
    return (
      <div key={clave} style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: largo ? '1 / -1' : undefined }}>
        <label htmlFor={`${prefijo}_${clave}`} style={{ fontSize: compacto ? '11px' : '12px', fontWeight: '600', color: falta ? '#ef4444' : theme.textSecondary }}>
          {etiquetaDe(clave)} {falta && <span>(falta)</span>}
        </label>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          {largo ? (
            <textarea id={`${prefijo}_${clave}`} rows={2} value={valor ?? ''} disabled={!editable} onChange={(e) => cambiar(clave, e)} onBlur={(e) => alSalir(clave, e)} style={estilo} />
          ) : (
            <input id={`${prefijo}_${clave}`} type="text" value={valor ?? ''} disabled={!editable} onChange={(e) => cambiar(clave, e)} onBlur={(e) => alSalir(clave, e)} style={estilo} />
          )}
          <button
            type="button"
            onClick={() => handleToggleUnlock(`${prefijo}_${clave}`)}
            title={editable ? 'Bloquear campo' : 'Editar campo'}
            aria-label={editable ? `Bloquear ${etiquetaDe(clave)}` : `Editar ${etiquetaDe(clave)}`}
            style={{ padding: tam.boton, borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: editable ? '#fef3c7' : theme.subtleBg, color: editable ? '#d97706' : theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {editable ? <Unlock size={tam.icono} /> : <Lock size={tam.icono} />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {plegables && (
          <button type="button" onClick={() => abrirTodos(!todosAbiertos)} className="boton-plegar"
            title={todosAbiertos ? 'Deja abiertos solo los grupos donde falta algo' : 'Muestra todos los datos'}
            style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary, borderColor: theme.border }}>
            {todosAbiertos ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
            {todosAbiertos ? 'Ver solo lo que falta' : 'Ver todos los datos'}
          </button>
        )}
        <button
          type="button"
          onClick={() => { alternarTodos(); if (plegables && !todoAbierto) abrirTodos(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: todoAbierto ? (isDarkMode ? '#422006' : '#fef3c7') : theme.subtleBg, color: todoAbierto ? (isDarkMode ? '#fcd34d' : '#92400e') : theme.textPrimary, border: `1px solid ${theme.border}`, padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
        >
          {todoAbierto ? <Lock size={14} /> : <Pencil size={14} />}
          {todoAbierto ? 'Bloquear todos' : 'Editar todos los datos'}
        </button>
      </div>

      {grupos.map((g) => {
        const sePliega = plegables || g.plegado;
        const plegado = sePliega && !estaAbierto(g);
        const nFaltan = g.plegado ? 0 : faltanDe(g);
        const titulo = (
          <>
            <span style={{ color: nFaltan > 0 ? '#ef4444' : undefined }}>{g.titulo}</span>
            {g.plegado && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>({g.campos.length})</span>}
            {plegables && !g.plegado && (nFaltan > 0
              ? <span className="grupo-faltan">{nFaltan} {nFaltan === 1 ? 'falta' : 'faltan'}</span>
              : <CheckCircle size={13} color="#10b981" aria-label="Completo" />)}
            {sePliega && <span style={{ marginLeft: 'auto', display: 'flex' }}>{plegado ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</span>}
          </>
        );
        const estiloTitulo = { margin: '0 0 10px 0', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px', color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: '6px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '6px', width: '100%' };
        return (
          <section key={g.titulo} style={{ marginBottom: plegado ? '8px' : '18px' }}>
            {sePliega ? (
              <h4 style={{ margin: 0 }}>
                <button type="button" className="grupo-plegable" aria-expanded={!plegado} onClick={() => alternarGrupo(g.titulo, plegado)}
                  style={{ ...estiloTitulo, background: 'none', border: 'none', borderBottom: `1px solid ${theme.border}`, padding: '4px 0 6px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  {titulo}
                </button>
              </h4>
            ) : (
              <h4 style={estiloTitulo}>{titulo}</h4>
            )}
            {g.nota && !plegado && <p style={{ fontSize: '11px', color: theme.textSecondary, margin: '-4px 0 10px 0' }}>{g.nota}</p>}
            {!plegado && (
              <div style={{ display: 'grid', gridTemplateColumns: compacto ? 'repeat(auto-fill, minmax(240px, 1fr))' : 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
                {g.campos.map(campo)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

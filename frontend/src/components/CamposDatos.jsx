import { useState } from 'react';
import { ChevronDown, ChevronUp, Lock, Pencil, Unlock } from 'lucide-react';
import { useApp } from '../AppContext';
import { CAMPOS_LARGOS, agruparDatos, esPuntoInmueble, etiquetaDe } from '../camposExpediente';
import { esDatoVacio } from '../datosFaltantes';

// Lista de datos de un expediente, agrupada y editable.
// prefijo: identifica los candados de este expediente (ej. 'single' o 'batch_3').
export default function CamposDatos({ datos, prefijo, faltantes = [], onCambio, compacto = false, coac = false }) {
  const { theme, isDarkMode, unlockedFields, setUnlockedFields, handleToggleUnlock } = useApp();
  const [abiertos, setAbiertos] = useState({});
  const grupos = agruparDatos(datos, coac);

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
    const conConyuge = /^s[ií]/i.test(String(datos.tiene_conyuge || '')) || !esDatoVacio(datos.nombre_conyuge);
    const opcional = esPuntoInmueble(clave) || clave === 'tiene_conyuge' || (clave === 'nombre_conyuge' && !conConyuge);
    const falta = faltantes.includes(clave) || (valor === '' && !opcional);
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
            <textarea id={`${prefijo}_${clave}`} rows={2} value={valor ?? ''} disabled={!editable} onChange={(e) => onCambio(clave, e.target.value)} style={estilo} />
          ) : (
            <input id={`${prefijo}_${clave}`} type="text" value={valor ?? ''} disabled={!editable} onChange={(e) => onCambio(clave, e.target.value)} style={estilo} />
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <button
          type="button"
          onClick={alternarTodos}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: todoAbierto ? (isDarkMode ? '#422006' : '#fef3c7') : theme.subtleBg, color: todoAbierto ? (isDarkMode ? '#fcd34d' : '#92400e') : theme.textPrimary, border: `1px solid ${theme.border}`, padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
        >
          {todoAbierto ? <Lock size={14} /> : <Pencil size={14} />}
          {todoAbierto ? 'Bloquear todos' : 'Editar todos los datos'}
        </button>
      </div>

      {grupos.map((g) => {
        const plegado = g.plegado && !abiertos[g.titulo];
        return (
          <section key={g.titulo} style={{ marginBottom: '18px' }}>
            <h4
              onClick={g.plegado ? () => setAbiertos((p) => ({ ...p, [g.titulo]: !p[g.titulo] })) : undefined}
              style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px', color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: '6px', cursor: g.plegado ? 'pointer' : 'default', borderBottom: `1px solid ${theme.border}`, paddingBottom: '6px' }}
            >
              {g.titulo}
              {g.plegado && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>({g.campos.length})</span>}
              {g.plegado && (plegado ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
            </h4>
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

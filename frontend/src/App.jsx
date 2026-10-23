import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api, API_BASE, alExpirarSesion, encabezadosSesion, guardarToken } from './api';
import { AppContext } from './AppContext';
import LoginScreen from './components/LoginScreen';
import LogoutModal from './components/LogoutModal';
import ModalPassword from './components/ModalPassword';
import Notificaciones from './components/Notificaciones';
import PanelVistaPrevia from './components/PanelVistaPrevia';
import PantallaCarga from './components/PantallaCarga';
import { avisar, confirmar } from './ui/notificaciones';
import { instalarEfectoOnda } from './ui/efectoOnda';
import { CAMPOS_DEL_ACTO, CAMPOS_TRABAJADOR_DOS, GRUPOS_CAMPOS, esPlantillaCoac, esPuntoInmueble, etiquetaDe } from './camposExpediente';

// Datos principales del expediente (los que se ven en pantalla, sin el desglose del inmueble)
const CAMPOS_PRINCIPALES = new Set([...GRUPOS_CAMPOS.flatMap((g) => g.campos), ...CAMPOS_TRABAJADOR_DOS]);
import { sugerenciaActual } from './sugerenciaPlantilla';
import { generoDeNombre } from './ui/generoNombre';
import { nombrePlantilla } from './plantillasCatalogo';
import { conConversiones } from './ui/conversiones';
import { camposFaltantes, etiquetaCampo, mensajeFaltantes, normalizarPlantilla, revisarIncidencia } from './datosFaltantes';
import Sidebar from './components/Sidebar';
import TabExcel from './components/TabExcel';
import TabHistorial from './components/TabHistorial';
import ModalCompartir from './components/ModalCompartir';
import ModalCompletarPdfs from './components/ModalCompletarPdfs';
import TabIndividual from './components/TabIndividual';
import TabManual from './components/TabManual';
import TabMasivo from './components/TabMasivo';
import TabUsuarios from './components/TabUsuarios';
import TabKpis from './components/TabKpis';
import TabPerfil from './components/TabPerfil';
import NavegacionMovil from './components/NavegacionMovil';
import { AvisoInactividad, AvisoSesionCerrada, AvisoVersionNueva } from './components/AvisosSesion';
import useVersionNueva from './ui/versionNueva';
import useVigilanciaSesion from './vigilanciaSesion';
import useCelular from './usarCelular';
import { COLOR_ACENTO_DEFECTO, colorLegible } from './colores';
import { renderAsync } from 'docx-preview';
import { AlertCircle } from 'lucide-react';

// Estado de los botones atrás/adelante del navegador (fuera de React: solo lo usan los eventos del navegador)
const navegador = { guardia: false, auth: false, tab: 'single', alSalir: null, alExpirar: null, alVolverPestana: null, alRevisar: null };


export default function App() {
  // --- TEMA (CLARO / OSCURO) ---
  // temaPreferido: 'claro' | 'oscuro' | 'sistema' (se guarda en la cuenta y en este navegador)
  const leerLocal = (clave, defecto) => { try { return localStorage.getItem(clave) ?? defecto; } catch { return defecto; } };
  const guardarLocal = (clave, valor) => { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } };
  const [temaPreferido, setTemaPreferido] = useState(() => {
    const t = leerLocal('tema', null);
    if (t === 'claro' || t === 'oscuro' || t === 'sistema') return t;
    return leerLocal('theme', 'light') === 'dark' ? 'oscuro' : 'claro';
  });
  const [sistemaOscuro, setSistemaOscuro] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches || false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const cambio = (e) => setSistemaOscuro(e.matches);
    mq.addEventListener('change', cambio);
    return () => mq.removeEventListener('change', cambio);
  }, []);
  const isDarkMode = temaPreferido === 'oscuro' || (temaPreferido === 'sistema' && sistemaOscuro);
  useEffect(() => {
    guardarLocal('tema', temaPreferido);
    guardarLocal('theme', isDarkMode ? 'dark' : 'light');
  }, [temaPreferido, isDarkMode]);

  // Color del sistema elegido por cada usuario
  const [colorAcento, setColorAcento] = useState(() => leerLocal('color_acento', '') || COLOR_ACENTO_DEFECTO);
  const acento = colorLegible(colorAcento);
  useEffect(() => {
    guardarLocal('color_acento', colorAcento);
    const raiz = document.documentElement;
    raiz.style.setProperty('--acento', acento);
    raiz.style.setProperty('--acento-suave', `${acento}1f`);
  }, [colorAcento, acento]);

  // ESTADO PARA EL MENÚ DESPLEGABLE DE EXPORTACIÓN
  const [showExportMenu, setShowExportMenu] = React.useState(false);

  // Estado para la plantilla seleccionada (por defecto la primera de CDMX)
const [selectedPlantilla, setSelectedPlantilla] = React.useState('CDMX_AP_H_SOLTERO');

  // FUNCIÓN MULTI-FORMATO DE EXPORTACIÓN
  // Monto con formato de pesos ($250,000.00); si no es número se deja como viene
  const formatearMonto = (valor) => {
    if (valor === null || valor === undefined || String(valor).trim() === '' || String(valor).toUpperCase() === 'NO_ENCONTRADO') return '—';
    const numero = Number(String(valor).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(numero) || String(valor).replace(/[^0-9]/g, '') === '') return String(valor);
    return numero.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  };

  // Filas del reporte (las mismas columnas en todos los formatos)
  const filasReporte = () => filteredHistorial.map((item, index) => {
    const dExtra = item.datos_extraidos || {};
    const p = parsearFechaExpediente(item);
    return {
      numero: index + 1,
      propietario: item.usuario_propietario || item.usuario || 'N/A',
      acreditado: dExtra.nombre_acreditado || dExtra.acreditado || item.acreditado || 'N/A',
      credito: dExtra.numero_credito || item.numero_credito || 'N/A',
      monto: formatearMonto(dExtra.monto_credito || item.monto),
      fecha: p ? p.fechaTexto : (item.fecha || 'N/A'),
      hora: p ? p.horaTexto : (item.hora || ''),
      estado: { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' }[item.estado] || 'Generado',
      incidencia: revisarIncidencia(dExtra).incidencia ? 'Sí' : 'No',
    };
  });
  const COLUMNAS_REPORTE = [
    ['numero', '#'], ['propietario', 'Propietario'], ['acreditado', 'Acreditado'], ['credito', 'No. Crédito'],
    ['monto', 'Monto'], ['fecha', 'Fecha'], ['hora', 'Hora'], ['estado', 'Estado'], ['incidencia', 'Incidencia'],
  ];

  const descargarBlob = (contenido, tipo, nombre) => {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', nombre);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format) => {
    setShowExportMenu(false);

    if (filteredHistorial.length === 0) {
      avisar.aviso("No hay datos para exportar.");
      return;
    }

    const now = new Date();
    const fechaEmision = now.toLocaleDateString('es-MX') + ' ' + now.toLocaleTimeString('es-MX');
    const nombreBase = `Reporte_Expedientes_${now.toISOString().slice(0, 10)}`;
    const filas = filasReporte();
    const escaparHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    try {
      // 1. EXCEL (.CSV)
      if (format === 'csv') {
        const celda = (v) => `"${String(v).replace(/"/g, '""')}"`;
        const lineas = [
          '\uFEFFREPORTE DE HISTORIAL DE EXPEDIENTES',
          `Fecha de Emisión:,${celda(fechaEmision)}`,
          `Total de Registros:,${filas.length}`,
          '',
          COLUMNAS_REPORTE.map(([, t]) => celda(t)).join(','),
          ...filas.map((f) => COLUMNAS_REPORTE.map(([k]) => celda(f[k])).join(',')),
        ];
        descargarBlob(lineas.join('\n'), 'text/csv;charset=utf-8;', `${nombreBase}.csv`);
        avisar.exito('Reporte de Excel descargado.');
      }

      // 2. WORD (.DOC) — Word abre directamente esta tabla
      if (format === 'word') {
        const encabezado = COLUMNAS_REPORTE.map(([, t]) => `<th>${escaparHtml(t)}</th>`).join('');
        const cuerpo = filas.map((f) => `<tr>${COLUMNAS_REPORTE.map(([k]) => `<td>${escaparHtml(f[k])}</td>`).join('')}</tr>`).join('');
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Reporte</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:16pt;color:${acento}}table{border-collapse:collapse;width:100%}th{background:${acento};color:#fff;padding:6px;text-align:left}td{border-bottom:1px solid #cbd5e1;padding:5px}</style></head>
<body><h1>Reporte de Historial de Expedientes</h1><p>Fecha de emisión: ${escaparHtml(fechaEmision)}<br>Total de registros: ${filas.length}</p>
<table><thead><tr>${encabezado}</tr></thead><tbody>${cuerpo}</tbody></table></body></html>`;
        descargarBlob('\uFEFF' + html, 'application/msword', `${nombreBase}.doc`);
        avisar.exito('Reporte de Word descargado.');
      }

      // 3. TEXTO (.TXT) — columnas alineadas
      if (format === 'txt') {
        const anchos = COLUMNAS_REPORTE.map(([k, t]) => Math.max(t.length, ...filas.map((f) => String(f[k]).length)));
        const linea = (vals) => vals.map((v, i) => String(v).padEnd(anchos[i])).join('  ');
        const texto = [
          'REPORTE DE HISTORIAL DE EXPEDIENTES',
          `Fecha de emisión: ${fechaEmision}`,
          `Total de registros: ${filas.length}`,
          '',
          linea(COLUMNAS_REPORTE.map(([, t]) => t)),
          anchos.map((a) => '-'.repeat(a)).join('  '),
          ...filas.map((f) => linea(COLUMNAS_REPORTE.map(([k]) => f[k]))),
        ].join('\r\n');
        descargarBlob('\uFEFF' + texto, 'text/plain;charset=utf-8', `${nombreBase}.txt`);
        avisar.exito('Reporte de texto descargado.');
      }

      // 4. IMAGEN (.PNG)
      if (format === 'image') {
        const html2canvas = (await import('html2canvas')).default;
        const element = document.getElementById('tabla-historial-export');
        if (!element) {
          avisar.error("No se encontró la tabla para captura.");
          return;
        }
        const canvas = await html2canvas(element, { scale: 2 });
        const link = document.createElement('a');
        link.download = `${nombreBase}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        avisar.exito('Imagen del reporte descargada.');
      }

      // 5. IMPRIMIR / PDF
      if (format === 'print') {
        window.print();
      }
    } catch (err) {
      avisar.error('No se pudo generar el reporte: ' + err.message);
    }
  };
;

 // --- 1. ESTADOS DE TEMA Y SESIÓN ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  // Pantalla de bienvenida después de iniciar sesión: null o { nombre, saliendo }
  const [bienvenida, setBienvenida] = useState(null);
  const [animarEntrada, setAnimarEntrada] = useState(false);

  // --- 2. ESTADOS DE AUTENTICACIÓN / LOGIN ---
  const [loginUser, setLoginUser] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  // Sesión cerrada sola (inactividad u otro dispositivo) y aviso de los últimos segundos
  const [avisoSesion, setAvisoSesion] = useState(null);
  const [avisoInactividad, setAvisoInactividad] = useState(null);
  // Funciones que ya tiene el servidor (si la pantalla se publica antes que el servidor, se ocultan las nuevas)
  const [funcionesServidor, setFuncionesServidor] = useState([]);
  const actualizarFunciones = (lista) => {
    const nuevas = Array.isArray(lista) ? lista : [];
    setFuncionesServidor((prev) => (prev.join('|') === nuevas.join('|') ? prev : nuevas));
  };
  const puedeServidor = (funcion) => funcionesServidor.includes(funcion);
  // Compartir expedientes: ventana abierta ({ ids } o { todos }) y si a esta persona le compartieron algo
  const [modalCompartir, setModalCompartir] = useState(null);
  const [modalCompletarPdfs, setModalCompletarPdfs] = useState(false);
  const [hayCompartidos, setHayCompartidos] = useState(false);
  // Ventana de contraseña: null, { modo: 'propio' } o { modo: 'reset', usuario }
  const [modalPassword, setModalPassword] = useState(null);
  // Evitan doble clic mientras se descarga o guarda algo
  const [descargandoId, setDescargandoId] = useState(null);
  const [descargandoZip, setDescargandoZip] = useState(false);
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  // Campos que usa cada plantilla (para avisar qué datos faltan)
  const [camposPorPlantilla, setCamposPorPlantilla] = useState({});

  // --- 3. NAVEGACIÓN Y TABS ---
  const [activeTab, setActiveTab] = useState('single');
  // Celular y tablet: navegación con pestañas abajo (en lugar de la barra lateral)
  const esMovil = useCelular('(max-width: 1024px)');

  // --- 4. VISTA PREVIA FLOTANTE (una sola para todo el sistema) ---
  // vistaPrevia: null o { origen: 'single' | 'batch' | 'manual' | 'historial', index?, datos?, plantilla?, titulo?, lado }
  const [vistaPrevia, setVistaPrevia] = useState(null);
  const [resultadoPrevia, setResultadoPrevia] = useState({ clave: null, error: '' }); // última respuesta recibida
  const [documentoPrevia, setDocumentoPrevia] = useState(null); // documento ya dibujado (nodo HTML)
  const [versionPrevia, setVersionPrevia] = useState(0);        // para el botón "volver a generar"
  const [actosSingle, setActosSingle] = useState([]); // actos de la constancia (caso individual)
  const [sugerenciaBase, setSugerenciaBase] = useState(null); // plantilla sugerida según los documentos
  const [avisosSingle, setAvisosSingle] = useState([]); // avisos al leer (ej. falta la constancia)
  // Cómo venían los datos al leerlos (para medir cuántos campos se corrigieron a mano, en los KPIs)
  const [lecturaSingle, setLecturaSingle] = useState(null); // { datos, leido_en }
  const turnoPrevia = useRef(0);                                // descarta respuestas viejas
  const hayDocumentoPrevia = useRef(false);
  const manualPreviewRef = useRef(null);

  // --- 5. MAPA DE DESBLOQUEO ---
  const [unlockedFields, setUnlockedFields] = useState({});

  // --- 6. ESTADOS - Caso Individual ---
  // Caso individual: la carta y la constancia se suben por separado
  const [cartaSingle, setCartaSingle] = useState(null);
  const [constanciaSingle, setConstanciaSingle] = useState(null);
  // Coacreditados: segunda carta (la del "TRABAJADOR DOS")
  const [carta2Single, setCarta2Single] = useState(null);
  const [coacManual, setCoacManual] = useState(false); // la persona pidió el recuadro de la carta dos
  // Edición de un expediente ya guardado (desde Mi Historial) con el mismo espacio de trabajo del Caso Individual:
  // { id, nombre, credito, estado, datos (los guardados), plantilla }
  const [edicionSingle, setEdicionSingle] = useState(null);
  const [cargandoPdfs, setCargandoPdfs] = useState(false); // abriendo los PDF guardados de un expediente
  const turnoPdfs = useRef(0); // si cambia mientras se bajan los PDF, ya no se usan
  const singleFiles = [cartaSingle, carta2Single, constanciaSingle].filter(Boolean);
  const [loading, setLoading] = useState(false);
  const [progressSingle, setProgressSingle] = useState(0);
  const [expedienteId, setExpedienteId] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  // --- 7. ESTADOS - Carga Masiva ---
  // Carga masiva: cartas y constancias en recuadros separados
  const [cartasLote, setCartasLote] = useState([]);
  const [constanciasLote, setConstanciasLote] = useState([]);
  const batchFiles = [...cartasLote, ...constanciasLote];
  const [batchLoading, setBatchLoading] = useState(false);
  const [progressBatch, setProgressBatch] = useState(0);
  const [batchResults, setBatchResults] = useState([]);
  const [openAccordion, setOpenAccordion] = useState({});
  const [selectedBatchIndices, setSelectedBatchIndices] = useState([]);

  // --- 8. ESTADOS - Historial & Filtros Dinámicos ---
  const [historial, setHistorial] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos'); // todos / GENERADO / REVISADO / ENTREGADO
  const [filterPeriod, setFilterPeriod] = useState('all'); // 'all', 'day', 'week', 'month', 'year'
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0 - 11
  const [selectedWeek, setSelectedWeek] = useState('all'); // 'all', 1, 2, 3, 4, 5
  const [selectedDay, setSelectedDay] = useState('all'); // 'all', 1 .. 31
  const [sortAscending, setSortAscending] = useState(true);

  // --- 9. ESTADOS - Panel de Administración y Usuarios ---
  const [usuariosLista, setUsuariosLista] = useState([]);
  const [nuevoUsuario, setNuevoUsuario] = useState({ username: '', password: '', role: 'operador', es_admin: false });
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  // --- 10. ESTADOS - Plantillas, Excel y Formulario Manual ---
  const [plantillas, setPlantillas] = useState([]);
  const [archivoPlantilla, setArchivoPlantilla] = useState(null);
  const [archivoExcel, setArchivoExcel] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [expedientes, setExpedientes] = useState([]);
  const [formData, setFormData] = useState({
    numero_credito: '',
    nombre_acreditado: '',
    monto_credito: '',
    oficina_registral: '',
    numero_carta: '',
    entidad_financiera: '',
    fecha_liquidacion: '',
    folio_real: '',
    datos_inmueble: '',
    fecha_expedicion: '',
    credito_a_salario: '',
    numero_escritura: '',
    fecha_escritura: '',
    notario_origen_completo: '',
    nombre_conyuge: ''
  });

  // --- 11. ESTADOS - Paginación ---
  const [paginaActual, setPaginaActual] = useState(1);
  const elementosPorPagina = 15;

  // Calcular elementos de la página actual
  const indiceUltimoItem = paginaActual * elementosPorPagina;
  const indicePrimerItem = indiceUltimoItem - elementosPorPagina;
  const elementosVisibles = batchResults.slice(indicePrimerItem, indiceUltimoItem);
  const totalPaginas = Math.ceil(batchResults.length / elementosPorPagina);

  // --- 12. ESTADOS - CARGA EXCEL ---

  const [filasPreview, setFilasPreview] = useState([]);
  const [filasSeleccionadas, setFilasSeleccionadas] = useState([]);
  const [progreso, setProgreso] = useState(0);
  const [textoProgreso, setTextoProgreso] = useState('');
  const [estadoFilas, setEstadoFilas] = useState({});
  const [contadoresRemosion, setContadoresRemosion] = useState({});
  const [plantillasFilas, setPlantillasFilas] = useState({});


  // ==========================================
  // --- EFECTOS (USEEFFECT) ---
  // ==========================================

  // Efecto de onda al hacer clic en los botones
  useEffect(() => instalarEfectoOnda(), []);

  // Validar sesión activa al recargar la página (F5), una sola vez
  useEffect(() => {
    verificarSesion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    api.get('/plantillas/campos')
      .then((res) => setCamposPorPlantilla(res.data?.campos || {}))
      .catch(() => setCamposPorPlantilla({})); // si falla, se usa la lista básica
  }, [isAuthenticated]);

  // Datos vacíos que sí usa la plantilla indicada
  const faltantesPara = (datosRevisar, plantilla) =>
    camposFaltantes(datosRevisar || {}, camposPorPlantilla[normalizarPlantilla(plantilla)]);

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'history' || activeTab === 'compartidos') cargarHistorialUsuario(activeTab);
      if (activeTab === 'users' && (currentUser?.es_admin || currentUser?.role === 'admin')) cargarUsuarios();
      if (activeTab === 'templates' && (currentUser?.es_admin || currentUser?.role === 'admin')) cargarPlantillas();
    }
  }, [activeTab, isAuthenticated, currentUser]);

  // ---------- VISTA PREVIA: qué documento se debe mostrar ----------
  const solicitudPrevia = (() => {
    if (!vistaPrevia) return null;
    if (vistaPrevia.origen === 'single') {
      return datos ? { datos, plantilla: selectedPlantilla, titulo: datos.nombre_acreditado } : null;
    }
    if (vistaPrevia.origen === 'batch') {
      const item = batchResults[vistaPrevia.index];
      if (!item || item.error) return null;
      return {
        datos: item.datos_extraidos,
        plantilla: item.plantilla_seleccionada || selectedPlantilla,
        titulo: item.datos_extraidos?.nombre_acreditado,
      };
    }
    if (vistaPrevia.origen === 'manual') {
      return { datos: formData, plantilla: selectedPlantilla || 'CDMX_AP_H_SOLTERO', titulo: formData.nombre_acreditado || 'Captura manual' };
    }
    return { datos: vistaPrevia.datos, plantilla: vistaPrevia.plantilla, titulo: vistaPrevia.titulo };
  })();
  const clavePrevia = solicitudPrevia
    ? JSON.stringify([solicitudPrevia.datos, solicitudPrevia.plantilla, versionPrevia])
    : null;

  // Cada vez que cambian los datos o la plantilla se vuelve a generar (con una pausa
  // para no pedirlo en cada tecla). Si llegan respuestas viejas, se ignoran.
  useEffect(() => {
    if (!clavePrevia) return;
    const [datosPrevia, plantillaPrevia] = JSON.parse(clavePrevia);
    const miTurno = ++turnoPrevia.current;
    const espera = setTimeout(async () => {
      try {
        const res = await api.post(
          '/expedientes/vista-previa',
          { datos: datosPrevia, plantilla: plantillaPrevia },
          { responseType: 'arraybuffer' }
        );
        if (miTurno !== turnoPrevia.current) return;
        const nodo = document.createElement('div');
        await renderAsync(res.data, nodo);
        if (miTurno !== turnoPrevia.current) return;
        hayDocumentoPrevia.current = true;
        setDocumentoPrevia(nodo);
        setResultadoPrevia({ clave: clavePrevia, error: '' });
      } catch (err) {
        if (miTurno !== turnoPrevia.current) return;
        let mensaje = 'No se pudo generar la vista previa.';
        try {
          mensaje = JSON.parse(new TextDecoder().decode(err.response?.data))?.detail || mensaje;
        } catch { /* respuesta sin detalle */ }
        setResultadoPrevia({ clave: clavePrevia, error: mensaje });
      }
    }, hayDocumentoPrevia.current ? 600 : 0);
    return () => clearTimeout(espera);
  }, [clavePrevia]);

  const estadoPrevia = {
    cargando: !!clavePrevia && resultadoPrevia.clave !== clavePrevia,
    error: resultadoPrevia.clave === clavePrevia ? resultadoPrevia.error : '',
    plantilla: solicitudPrevia?.plantilla || '',
  };

  const cerrarVistaPrevia = () => {
    turnoPrevia.current++;
    hayDocumentoPrevia.current = false;
    setVistaPrevia(null);
    setDocumentoPrevia(null);
    setResultadoPrevia({ clave: null, error: '' });
  };

  const abrirVistaPrevia = (config) => {
   
    const mismo = vistaPrevia && vistaPrevia.origen === config.origen && vistaPrevia.index === config.index
      && (config.origen !== 'historial' || vistaPrevia.id === config.id);
    if (!mismo) {
      hayDocumentoPrevia.current = false;
      setDocumentoPrevia(null);
    }
    // Por defecto se abre del lado donde estorba menos
    const lado = vistaPrevia?.lado || config.lado || (config.origen === 'single' ? 'izquierda' : 'derecha');
    setVistaPrevia({ ...config, lado });
    if (mismo) setVersionPrevia((v) => v + 1);
  };

  const refrescarVistaPrevia = () => setVersionPrevia((v) => v + 1);
  const cambiarLadoPrevia = () =>
    setVistaPrevia((v) => (v ? { ...v, lado: v.lado === 'derecha' ? 'izquierda' : 'derecha' } : v));

  // Al cambiar de pestaña se cierran la vista previa y el visor de PDF
  const cambiarPestana = (pestana) => {
    cerrarVistaPrevia();
   
    if (pestana !== activeTab && navegador.guardia) {
      window.history.pushState({ app: 'cancelaciones', tipo: 'tab', tab: pestana }, '');
    }
    setActiveTab(pestana);
  };

  // Si cualquier llamada responde "sesión no válida", se regresa al login con un aviso
  useEffect(() => {
    alExpirarSesion((motivo) => navegador.alExpirar?.(motivo || 'cerrada'));
    return () => alExpirarSesion(null);
  }, []);

  // Datos y funciones actuales para los eventos del navegador
  useEffect(() => {
    navegador.auth = isAuthenticated;
    navegador.tab = activeTab;
    navegador.alSalir = handleConfirmLogout;
    navegador.alRevisar = verificarSesion;
    navegador.alVolverPestana = (pestana) => {
      cerrarVistaPrevia();
      setActiveTab(pestana);
    };
  });

  // ---------- BOTONES ATRÁS / ADELANTE DEL NAVEGADOR ----------
  // Cada pestaña queda en el historial del navegador: "atrás" regresa a la pestaña anterior
  // en lugar de salir del sistema. Debajo de todas hay una entrada "base": si el usuario
  // llega a ella, se le pregunta si quiere cerrar sesión (y se cierra de verdad).

  const crearGuardiaHistorial = () => {
    if (navegador.guardia) return;
    window.history.replaceState({ app: 'cancelaciones', tipo: 'base' }, '');
    window.history.pushState({ app: 'cancelaciones', tipo: 'tab', tab: navegador.tab }, '');
    navegador.guardia = true;
  };

  useEffect(() => {
    const alNavegar = async (e) => {
      const n = navegador;
      if (!n.auth) return; // en el login, atrás/adelante no hacen nada especial
      const estado = e.state;
      if (estado?.app === 'cancelaciones' && estado.tipo === 'tab') {
        n.alVolverPestana?.(estado.tab);
        return;
      }
      // Llegó a la entrada base (o salió del sistema): se vuelve a poner la pestaña actual
      window.history.pushState({ app: 'cancelaciones', tipo: 'tab', tab: n.tab }, '');
      const salir = await confirmar('Si sales, se cerrará tu sesión y tendrás que volver a ingresar.', {
        titulo: '¿Salir del sistema?',
        textoConfirmar: 'Sí, cerrar sesión',
        textoCancelar: 'Seguir aquí',
        peligro: true,
      });
      if (salir) n.alSalir?.();
    };
    // Si el navegador regresa la página desde su memoria (botón adelante), se revisa
    // con el servidor que la sesión siga siendo válida
    const alMostrar = (e) => { if (e.persisted) navegador.alRevisar?.(); };
    // Si la sesión se recuperó al recargar, la entrada base se crea con la primera interacción
    // (los navegadores ignoran las entradas creadas sin que el usuario haya hecho clic)
    const alInteractuar = () => { if (navegador.auth) crearGuardiaHistorial(); };
    window.addEventListener('popstate', alNavegar);
    window.addEventListener('pageshow', alMostrar);
    window.addEventListener('pointerdown', alInteractuar, true);
    window.addEventListener('keydown', alInteractuar, true);
    return () => {
      window.removeEventListener('popstate', alNavegar);
      window.removeEventListener('pageshow', alMostrar);
      window.removeEventListener('pointerdown', alInteractuar, true);
      window.removeEventListener('keydown', alInteractuar, true);
    };
  }, []);



  // ==========================================
  // --- FUNCIONES Y MANEJADORES ---
  // ==========================================

  // Guarda la preferencia en la cuenta (si falla, queda al menos en este navegador)
  const guardarPreferencias = (cambios) => {
    api.put('/perfil', cambios).catch(() => {});
  };
  const cambiarTema = (tema) => {
    setTemaPreferido(tema);
    guardarPreferencias({ tema });
  };
  const toggleTheme = () => cambiarTema(isDarkMode ? 'claro' : 'oscuro');
  // Al entrar se aplican el color y el tema guardados en la cuenta
  // Cada usuario tiene su propio color y tema: siempre se toman de SU cuenta
  // (si no ha elegido, los de fábrica), aunque en este navegador haya entrado otra persona antes.
  const aplicarPreferenciasDe = (user) => {
    if (!user) return;
    setColorAcento(user.color_acento || COLOR_ACENTO_DEFECTO);
    setTemaPreferido(user.tema === 'claro' || user.tema === 'oscuro' || user.tema === 'sistema' ? user.tema : 'claro');
  };

  const verificarSesion = async () => {
    try {
      // /auth/sesion responde 200 aunque no haya sesión, así la consola no muestra errores
      const res = await api.get('/auth/sesion');
      if (res.data?.autenticado && res.data?.user) {
        actualizarFunciones(res.data.funciones);
        setCurrentUser(res.data.user);
        aplicarPreferenciasDe(res.data.user);
        setIsAuthenticated(true);
      } else {
        guardarToken(null);
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } catch {
      // Sin conexión con el servidor: se muestra la pantalla de login
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const res = await api.post('/auth/login', {
        username: loginUser.trim(),
        password: loginPassword
      });

      if (res.data?.status === 'ok') {
        guardarToken(res.data.token);
        actualizarFunciones(res.data.funciones);
        setCurrentUser(res.data.user);
        aplicarPreferenciasDe(res.data.user);
        setIsAuthenticated(true);
        navegador.auth = true;
        crearGuardiaHistorial();
        // Presentación de bienvenida (se va sola)
        const nombreSaludo = (res.data.user?.nombre_mostrar || res.data.user?.username || '').trim();
        setBienvenida({ nombre: nombreSaludo, genero: res.data.user?.genero || generoDeNombre(nombreSaludo), saliendo: false });
        setTimeout(() => {
          setBienvenida((b) => (b ? { ...b, saliendo: true } : b));
          setAnimarEntrada(true); // el sistema entra mientras se desvanece la bienvenida
        }, 1700);
        setTimeout(() => setBienvenida(null), 2100);
        setTimeout(() => setAnimarEntrada(false), 3000);
        setLoginPassword('');
        setCartaSingle(null); setConstanciaSingle(null); setCarta2Single(null); setCoacManual(false);
        setDatos(null); setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]);
        setBatchResults([]);
      }
    } catch (err) {
      setLoginError(err.response?.data?.detail || 'Error al iniciar sesión.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // La sesión se cerró sola: se avisa por qué y se regresa al login
  const expirarSesion = (motivo, segundos) => {
    if (!navegador.auth) return;
    navegador.auth = false;
    setAvisoInactividad(null);
    setAvisoSesion({ motivo, segundos: segundos || 900 });
    handleConfirmLogout();
  };
  useEffect(() => { navegador.alExpirar = expirarSesion; });
  const seguirTrabajando = useVigilanciaSesion({
    activo: isAuthenticated,
    onExpirar: (motivo, segundos) => navegador.alExpirar?.(motivo, segundos),
    onAviso: setAvisoInactividad,
    onFunciones: actualizarFunciones,
  });

  const handleConfirmLogout = async () => {
    cerrarVistaPrevia();
    // (el token se borra después de avisar al servidor)
    navegador.auth = false;
    navegador.guardia = false;
    window.history.replaceState(null, '');
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    } finally {
      guardarToken(null);
      setIsAuthenticated(false);
      setCurrentUser(null);
      setColorAcento(COLOR_ACENTO_DEFECTO);
      setShowLogoutModal(false);
      setError('');
      setLoginUser('');
      setLoginPassword('');
      setDatos(null); setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]);
      setBatchResults([]);
      setHistorial([]); fuenteHistorial.current = '';
      setModalCompartir(null); setHayCompartidos(false); setModalCompletarPdfs(false);

      // Al cerrar la sesión (a mano o por inactividad) se quita todo lo cargado: nada queda para el siguiente que entre
      setCartaSingle(null); setConstanciaSingle(null); setCarta2Single(null); setCoacManual(false);
      setCartasLote([]); setConstanciasLote([]); setSelectedBatchIndices([]); setOpenAccordion({});
      setExpedienteId(''); setLecturaSingle(null); setUnlockedFields({});
      // Un expediente que se estaba editando (propio o compartido) no se queda abierto para la siguiente persona
      setEdicionSingle(null); setVistaPrevia(null); setModalPassword(null); setGuardando({});
      turnoPdfs.current += 1; setCargandoPdfs(false);
      setNuevoUsuario({ username: '', password: '', role: 'operador', es_admin: false });
      setProgressSingle(0); setProgressBatch(0); setLoading(false); setBatchLoading(false);
      setSelectedPlantilla('CDMX_AP_H_SOLTERO');
      setFormData((f) => Object.fromEntries(Object.keys(f).map((k) => [k, ''])));
      setExpedientes([]); setPlantillasFilas({}); setPaginaActual(1);
      setSearchQuery(''); setFiltroEstado('todos');

      // Limpieza de Excel
      setArchivoExcel(null);
      setFilasPreview([]);
      setFilasSeleccionadas([]);
      setEstadoFilas({});
      setContadoresRemosion({});
      setProgreso(0);
      setTextoProgreso('');

      // 👈 NUEVO: Regresar a la pestaña principal por defecto al salir
      setActiveTab('single'); // Cambia esto por el estado o función que cambie de pestaña en tu app
    }
  };

  const fuenteHistorial = useRef('');
  const cargarHistorialUsuario = async (pestana = activeTab) => {
    setCargandoHistorial(true);
    // «Compartidos conmigo» usa la misma tabla que Mi Historial, con otra lista
    const fuente = pestana === 'compartidos' ? 'compartidos' : 'history';
    if (fuenteHistorial.current !== fuente) { setHistorial([]); fuenteHistorial.current = fuente; }
    try {
      const res = fuente === 'compartidos'
        ? await api.get('/compartidos')
        : await api.get('/expedientes', { params: { usuario: currentUser.username } });
      if (fuenteHistorial.current !== fuente) return; // se cambió de pestaña mientras cargaba
      setHistorial(res.data || []);
      if (fuente === 'compartidos') setHayCompartidos((res.data || []).length > 0);
    } catch (err) {
      console.error('Error al cargar historial:', err);
      avisar.error('No se pudo cargar el historial.');
    } finally {
      setCargandoHistorial(false);
    }
  };

  // 1. Funciones para manejar el arrastre y soltado correctamente

const handleDrop = (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const archivoArrastrado = e.dataTransfer.files[0];
    
    // Validamos que sea un archivo permitido (.xlsx, .xls, .csv)
    const nombre = archivoArrastrado.name.toLowerCase();
    if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls') || nombre.endsWith('.csv')) {
      setArchivoExcel(archivoArrastrado); // Asigna el archivo a tu estado (ej: setArchivoExcel)
    } else {
      avisar.aviso("Por favor, arrastra un archivo Excel o CSV válido.");
    }
    
    e.dataTransfer.clearData();
  }
};


const handlePreviewExcel = async (file) => {
  setArchivoExcel(file);
  setCargando(true);
  const dataForm = new FormData();
  dataForm.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/api/expedientes/previsualizar-excel`, {
      method: 'POST',
      credentials: 'include',
      headers: encabezadosSesion(),
      body: dataForm
    });
    const data = await res.json();
    if (res.ok && data.status === 'exito') {
      setFilasPreview(data.filas);
      setFilasSeleccionadas(data.filas.map(f => f.index)); // Seleccionados por defecto todos
    } else {
      avisar.error('Error al previsualizar: ' + (data.detail || 'Archivo inválido'));
    }
  } catch (err) {
    console.error(err);
    avisar.error('Error de conexión al leer el Excel.');
  } finally {
    setCargando(false);
  }
};


 const handleManualSubmit = async (e) => {
  e.preventDefault();
  setCargando(true);
  
  try {
    const API_URL = API_BASE;
    
    // Usamos axios en lugar de fetch para mantener la consistencia con el resto de la app
    const response = await axios.post(`${API_URL}/api/expedientes/generar-manual`, {
      ...formData,
      plantilla: selectedPlantilla || 'plantilla_manera2.docx'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data;
    if (data.status === 'exito') {
      avisar.exito('¡Expediente manual generado con éxito!');
      if (typeof setExpedientes === 'function' && Array.isArray(expedientes)) {
        setExpedientes([data, ...expedientes]);
      }
    }
  } catch (err) {
    console.error(err);
    const mensajeError = err.response?.data?.detail || 'No se pudo generar el expediente';
    avisar.error('Error: ' + mensajeError);
  } finally {
    setCargando(false);
  }
};

  const cargarUsuarios = async () => {
    setLoadingUsuarios(true);
    try {
      const res = await api.get('/admin/usuarios');
      setUsuariosLista(res.data || []);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const cargarPlantillas = async () => {
    try {
      const res = await api.get('/admin/plantilla');
      setPlantillas(res.data || []);
    } catch (err) {
      console.error('Error al cargar plantillas:', err);
    }
  };

  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    setCreandoUsuario(true);
    try {
      const formDataObj = new FormData();
      formDataObj.append('username', nuevoUsuario.username);
      formDataObj.append('password', nuevoUsuario.password);
      formDataObj.append('es_admin', nuevoUsuario.role === 'admin');
      formDataObj.append('rol', nuevoUsuario.role || 'operador');

      await api.post('/admin/usuarios', formDataObj);
      setNuevoUsuario({ username: '', password: '', role: 'operador', es_admin: false });
      cargarUsuarios();
      avisar.exito(`Usuario ${nuevoUsuario.username} creado.`);
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'Error al crear usuario.');
    } finally {
      setCreandoUsuario(false);
    }
  };

  const handleEliminarUsuario = async (param1, param2) => {
    if (param1 && param1.preventDefault) {
      param1.preventDefault();
    }

    const usuarioId = typeof param1 === 'string' ? param1 : param2;

    if (!usuarioId || typeof usuarioId !== 'string') {
      avisar.error('ID de usuario no válido');
      return;
    }
    const usuario = usuariosLista.find((u) => String(u.id) === String(usuarioId)) || {};
    const nombre = usuario.nombre_mostrar || usuario.username || 'este usuario';

    // Si tiene expedientes: se pregunta si desactivarlo o borrarlo junto con sus expedientes
    const eliminarConExpedientes = async (total) => {
      const cuantos = total ? `${total} expediente(s)` : 'expedientes';
      const r = await confirmar(
        `${nombre} tiene ${cuantos} registrados.\n\nPuedes desactivarlo (ya no podrá entrar y su trabajo se conserva) o eliminarlo junto con TODOS sus expedientes, su historial de cambios y su actividad en los reportes.\n\nAntes de borrar, el sistema hace un respaldo automático por si necesitas recuperar algo.`,
        { titulo: 'Este usuario tiene expedientes', textoConfirmar: 'Eliminar con sus expedientes', textoAlterno: 'Mejor desactivarlo', peligro: true },
      );
      if (r === 'alterno') {
        if (usuario.id && usuario.activo !== false) await handleCambiarActivo(usuario);
        return;
      }
      if (r !== true) return;
      if (!(await confirmar(
        `Se van a borrar definitivamente ${cuantos} de ${nombre} (@${usuario.username}). Revisa que sean los que quieres quitar: no aparecerán más en Mi Historial ni en los reportes.`,
        { titulo: '¿Seguro?', textoConfirmar: `Sí, borrar ${cuantos}`, peligro: true },
      ))) return;
      const res = await api.delete(`/admin/usuarios/${usuarioId}`, { params: { con_expedientes: true, confirmar: usuario.username } });
      avisar.exito(`Usuario eliminado con ${res.data?.expedientes_eliminados ?? 0} expediente(s). Se guardó un respaldo antes de borrar.`);
      cargarUsuarios();
    };

    try {
      if (usuario.expedientes > 0) {
        await eliminarConExpedientes(usuario.expedientes);
        return;
      }
      if (!(await confirmar('Se eliminará este usuario. Esta acción no se puede deshacer.', { titulo: 'Eliminar usuario', textoConfirmar: 'Sí, eliminar', peligro: true }))) {
        return;
      }
      try {
        await api.delete(`/admin/usuarios/${usuarioId}`);
      } catch (error) {
        // El servidor avisa que sí tiene expedientes
        if (error.response?.status === 409 && usuario.username) {
          await eliminarConExpedientes(0);
          return;
        }
        throw error;
      }
      avisar.exito('Usuario eliminado correctamente');
      cargarUsuarios();
    } catch (error) {
      console.error('Error al borrar usuario:', error);
      const status = error.response?.status;
      if (status === 401) {
        avisar.error('Sesión no válida o expirada. Por favor, inicia sesión nuevamente.');
      } else if (error.response?.data?.detail) {
        avisar.error(error.response.data.detail);
      } else {
        avisar.error('Error de conexión al eliminar usuario');
      }
    }
  };

  // --- Contraseñas y estado de usuarios ---
  const handleGuardarPassword = async (actual, nueva) => {
    if (modalPassword?.modo === 'restablecer') {
      await api.post(`/admin/usuarios/${modalPassword.usuario.id}/restablecer-password`, { password_admin: actual, password_nueva: nueva });
      avisar.exito(`Contraseña de ${modalPassword.usuario.username} restablecida. Entrégale la contraseña temporal: al entrar, el sistema le pedirá cambiarla.`);
      cargarUsuarios();
    } else if (modalPassword?.modo === 'reset') {
      await api.post(`/admin/usuarios/${modalPassword.usuario.id}/password`, { password_actual: actual, password_nueva: nueva });
      avisar.exito(`Contraseña de ${modalPassword.usuario.username} actualizada. Sus sesiones abiertas se cerraron.`);
    } else {
      await api.post('/auth/cambiar-password', { password_actual: actual, password_nueva: nueva });
      avisar.exito('Tu contraseña se actualizó correctamente.');
    }
    setModalPassword(null);
  };

  const handleCambiarActivo = async (usuario) => {
    const activar = usuario.activo === false;
    const pregunta = activar
      ? `¿Activar de nuevo a ${usuario.username}? Podrá volver a entrar al sistema.`
      : `¿Desactivar a ${usuario.username}? No podrá entrar al sistema, pero su historial se conserva.`;
    if (!(await confirmar(pregunta, { titulo: activar ? 'Activar usuario' : 'Desactivar usuario', textoConfirmar: activar ? 'Sí, activar' : 'Sí, desactivar', peligro: !activar }))) return;
    try {
      await api.put(`/admin/usuarios/${usuario.id}/activo`, { activo: activar });
      cargarUsuarios();
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'No se pudo cambiar el estado del usuario.');
    }
  };

  const handleCambiarRol = async (usuario, nuevo) => {
    const ROL_TXT = { admin: 'Administrador', operador: 'Operador', revisor: 'Revisor' };
    const antes = usuario.rol || (usuario.es_admin ? 'admin' : 'operador');
    if (!nuevo || nuevo === antes) return;
    const nombre = usuario.nombre_mostrar || usuario.username;
    const que = {
      admin: 'Podrá ver Usuarios, Reportes y Respaldos, y administrar cuentas.',
      operador: 'Podrá hacer expedientes (Caso Individual, Carga Masiva, etc.) y compartirlos.',
      revisor: 'Solo verá los expedientes que le compartan, para revisarlos, editarlos, cambiar su estado y descargarlos. Ya no podrá hacer expedientes nuevos.',
    }[nuevo];
    if (!(await confirmar(`¿Cambiar a ${nombre} de ${ROL_TXT[antes]} a ${ROL_TXT[nuevo]}?\n\n${que}\n\nSi tiene la sesión abierta, tendrá que volver a entrar.`,
      { titulo: 'Cambiar tipo de usuario', textoConfirmar: `Sí, hacerlo ${ROL_TXT[nuevo]}`, peligro: nuevo === 'admin' }))) return;
    try {
      const r = await api.put(`/admin/usuarios/${usuario.id}/rol`, { rol: nuevo, es_admin: nuevo === 'admin' });
      avisar.exito(r.data?.mensaje || 'Tipo de usuario actualizado.');
      cargarUsuarios();
    } catch (err) {
      avisar.error(err.response?.status === 404 ? 'El servidor todavía no tiene esta función (falta publicar la versión nueva).' : (err.response?.data?.detail || 'No se pudo cambiar el tipo de usuario.'));
    }
  };

  const handleSubirPlantilla = async (e) => {
    e.preventDefault();
    if (!archivoPlantilla) return;

    const formDataObj = new FormData();
    formDataObj.append('file', archivoPlantilla);

    try {
      await api.post('/admin/plantilla', formDataObj);
      setArchivoPlantilla(null);
      cargarPlantillas();
      avisar.exito('Plantilla subida correctamente.');
    } catch (err) {
      avisar.error(err.response?.data?.detail || 'Error al subir la plantilla.');
    }
  };

  const handleToggleUnlock = (fieldKey) => {
    setUnlockedFields((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  };

  const toggleAccordion = (index) => {
    setOpenAccordion((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const scanFilesFromEntry = async (entry) => {
    let pdfFiles = [];
    if (entry.isFile) {
      if (entry.name.toLowerCase().endsWith('.pdf')) {
        const file = await new Promise((resolve) => entry.file(resolve));
        pdfFiles.push(file);
      }
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = await new Promise((resolve) => dirReader.readEntries(resolve));
      for (const childEntry of entries) {
        const childFiles = await scanFilesFromEntry(childEntry);
        pdfFiles = pdfFiles.concat(childFiles);
      }
    }
    return pdfFiles;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Archivos PDF de lo que se soltó (archivos sueltos o carpetas con subcarpetas)
  const pdfsDeSoltar = async (e) => {
    let pdfs = [];
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      const entradas = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        if (entry) entradas.push(scanFilesFromEntry(entry));
      }
      if (entradas.length) pdfs = (await Promise.all(entradas)).flat();
    }
    if (pdfs.length === 0 && e.dataTransfer?.files) {
      pdfs = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    }
    return pdfs;
  };

  // Tipo de cada archivo según el recuadro donde se subió
  const tipoDeArchivo = (f) => {
    if (f && f === carta2Single) return 'carta2';
    return f === cartaSingle || cartasLote.includes(f) ? 'carta' : 'constancia';
  };

  // ---- Caso individual ----
  // Archivo con un nombre que ya está en uso: se le agrega su tipo, p. ej. "1599012345 (constancia).pdf".
  // El número de crédito del nombre se conserva, así se sigue agrupando con su carta.
  const nombreSinRepetir = (f, tipo, usados) => {
    if (!usados.has(f.name)) { usados.add(f.name); return f; }
    const base = f.name.replace(/\.pdf$/i, '');
    let nombre = `${base} (${tipo}).pdf`;
    for (let i = 2; usados.has(nombre); i += 1) nombre = `${base} (${tipo} ${i}).pdf`;
    usados.add(nombre);
    const copia = new File([f], nombre, { type: f.type || 'application/pdf', lastModified: f.lastModified });
    Object.defineProperty(copia, 'nombreOriginal', { value: f.nombreOriginal || f.name });
    return copia;
  };
  const elegirArchivoSingle = (tipo, archivos) => {
    let pdf = Array.from(archivos || []).find((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdf) { avisar.aviso('Elige un archivo PDF.'); return; }
    // Si otro recuadro ya tiene un archivo con el mismo nombre (y no es el mismo archivo), se distingue por su tipo
    const otros = { carta: cartaSingle, carta2: carta2Single, constancia: constanciaSingle };
    delete otros[tipo];
    const usados = new Set(Object.values(otros).filter(Boolean).map((f) => f.name));
    if (!Object.values(otros).some((f) => f && f.name === pdf.name && f.size === pdf.size)) pdf = nombreSinRepetir(pdf, tipo === 'carta2' ? 'carta 2' : tipo, usados);
    if (tipo === 'carta') setCartaSingle(pdf); else if (tipo === 'carta2') setCarta2Single(pdf); else setConstanciaSingle(pdf);
    setDatos(null); setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]); setError('');
  };
  const quitarArchivoSingle = (tipo) => {
    if (tipo === 'carta') setCartaSingle(null); else if (tipo === 'carta2') setCarta2Single(null); else setConstanciaSingle(null);
  };
  const soltarArchivoSingle = async (tipo, e) => {
    e.preventDefault(); e.stopPropagation();
    elegirArchivoSingle(tipo, await pdfsDeSoltar(e));
  };

  // ---- Carga masiva ----
  // Antes de cambiar los archivos del lote, avisar si hay expedientes leídos sin guardar
  const descartarLoteSinGuardar = async () => {
    const sinGuardar = batchResults.filter((r) => !r.error && !r.expediente_id).length;
    return sinGuardar === 0 || confirmar(`${sinGuardar} expediente(s) del lote anterior no se han guardado y se perderán.`, { titulo: '¿Cargar otro lote?', textoConfirmar: 'Sí, cargar otro', peligro: true });
  };
  const agregarArchivosLote = async (tipo, archivos) => {
    const pdfs = Array.from(archivos || []).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) { avisar.aviso('No se encontraron archivos PDF.'); return; }
    if (batchResults.length > 0) {
      if (!(await descartarLoteSinGuardar())) return;
      setBatchResults([]);
    }
    // Se agregan a los que ya estaban (sin repetir el mismo archivo)
    const fijar = tipo === 'carta' ? setCartasLote : setConstanciasLote;
    const actuales = tipo === 'carta' ? cartasLote : constanciasLote;
    const clave = (f) => `${f.nombreOriginal || f.name}|${f.size}`;
    const ya = new Set(actuales.map(clave));
    // Nombres ya usados en las dos zonas: dos archivos distintos nunca quedan con el mismo nombre
    // (antes, una carta y una constancia llamadas igual se confundían en la tabla)
    const usados = new Set([...cartasLote, ...constanciasLote].map((f) => f.name));
    const nuevos = [];
    pdfs.forEach((f) => {
      if (ya.has(clave(f))) return;
      ya.add(clave(f));
      nuevos.push(nombreSinRepetir(f, tipo, usados));
    });
    fijar((prev) => [...prev, ...nuevos]);
    setError('');
  };
  const quitarArchivoDeLote = (tipo, archivo) => {
    const fijar = tipo === 'carta' ? setCartasLote : setConstanciasLote;
    fijar((prev) => (archivo ? prev.filter((f) => f !== archivo) : []));
  };
  const soltarArchivosLote = async (tipo, e) => {
    e.preventDefault(); e.stopPropagation();
    await agregarArchivosLote(tipo, await pdfsDeSoltar(e));
  };

  // La carta y la constancia deben ser del mismo crédito: si los dos nombres traen número, deben ser idénticos
  const numeroEnNombre = (nombre) => (String(nombre || '').match(/(?<!\d)\d{8,12}(?!\d)/) || [null])[0];
  const conflictoSingle = (() => {
    const nc = numeroEnNombre(cartaSingle?.name);
    const nc2 = numeroEnNombre(carta2Single?.name);
    const nk = numeroEnNombre(constanciaSingle?.name);
    if (carta2Single) {
      // Coacreditados: las dos cartas y la constancia llevan el mismo número en el nombre (igual que las demás plantillas)
      if (cartaSingle && cartaSingle.name === carta2Single.name && cartaSingle.size === carta2Single.size) return { coac: true, mismoArchivo: true };
      const nums = [['carta del trabajador uno', nc], ['carta del trabajador dos', nc2], ['constancia', nk]].filter(([, n]) => n);
      const distintos = new Set(nums.map(([, n]) => n));
      return distintos.size > 1 ? { coac: true, detalle: nums } : null;
    }
    return nc && nk && nc !== nk ? { carta: nc, constancia: nk } : null;
  })();
  // Se muestran tres recuadros (dos cartas y la constancia) con plantilla de coacreditados
  const coacSingle = esPlantillaCoac(selectedPlantilla) || coacManual || !!carta2Single;

  const handleUploadSingle = async () => {
    if (singleFiles.length === 0) return;
    if (conflictoSingle) {
      avisar.error(conflictoSingle.mismoArchivo
        ? 'Subiste el mismo archivo en las dos cartas. Pon la carta del trabajador dos en su recuadro.'
        : conflictoSingle.coac
          ? `Los archivos no tienen el mismo número (${conflictoSingle.detalle.map(([, n]) => n).join(', ')}). Deben ser idénticos.`
          : `Los archivos no son del mismo crédito (${conflictoSingle.carta} y ${conflictoSingle.constancia}).`);
      return;
    }
    if (edicionSingle) {
      const nArchivo = singleFiles.map((f) => numeroEnNombre(f.name)).find(Boolean);
      const nExp = soloDigitos(edicionSingle.credito);
      if (nArchivo && nExp && nArchivo !== nExp && !(await confirmar(`Los archivos son del crédito ${nArchivo}, pero estás editando el expediente del crédito ${nExp}.`, { titulo: '¿Son los documentos correctos?', textoConfirmar: 'Sí, leerlos' }))) return;
    }
    await leerSingle(singleFiles);
  };

  const leerSingle = async (archivosLeer, tipoDe = tipoDeArchivo) => {
    cerrarVistaPrevia();
   
    setLoading(true);
    setProgressSingle(10);
    setError('');

    const interval = setInterval(() => {
      setProgressSingle((prev) => (prev < 90 ? prev + 15 : prev));
    }, 200);

    // Solo se LEEN los datos (no se guarda nada): primero se revisan y después se guardan
    const formDataObj = new FormData();
    archivosLeer.forEach((f) => { formDataObj.append('files', f); formDataObj.append('tipos', tipoDe(f)); });
    formDataObj.append('agrupar', 'false');

    try {
      const res = await api.post('/expedientes/leer', formDataObj);
      clearInterval(interval);
      const borrador = (res.data.borradores || [])[0];
      if (!borrador || borrador.error) {
        setError(borrador?.error || 'No se pudieron leer los archivos.');
        setLoading(false);
        return;
      }
      setProgressSingle(100);
      setTimeout(() => {
        setExpedienteId('');
        const rawDatos = borrador.datos_extraidos || {};
        const leidos = { numero_credito: rawDatos.numero_credito || '', ...rawDatos };
        const avisosEdicion = [];
        if (edicionSingle) {
          // Editando un expediente guardado: lo que no venga en los documentos se toma de lo guardado
          const vacio = (v) => v == null || String(v).trim() === '' || /^NO_ENCONTRADO$/i.test(String(v).trim());
          const guardados = edicionSingle.datos || {};
          const tomados = [];
          const distintos = [];
          Object.keys(guardados).forEach((k) => {
            if (k.startsWith('_') || k === 'plantilla_seleccionada' || k === 'plantilla' || typeof guardados[k] === 'object') return;
            if (vacio(guardados[k])) return;
            if (vacio(leidos[k])) { leidos[k] = guardados[k]; tomados.push(k); }
            else if (String(leidos[k]).trim() !== String(guardados[k]).trim()) distintos.push(k);
          });
          if (tomados.length) avisosEdicion.push(`Se dejaron ${tomados.length} dato(s) que ya estaban guardados y no vienen en los documentos: ${tomados.map(etiquetaDe).join(', ')}.`);
          if (distintos.length) avisosEdicion.push(`En los documentos vienen distintos ${distintos.length} dato(s) de lo guardado (se usan los de los documentos): ${distintos.map(etiquetaDe).join(', ')}.`);
        }
        setDatos(leidos);
        setActosSingle(borrador.actos || []);
        setSugerenciaBase(borrador.plantilla_sugerida || null);
        setAvisosSingle([...(borrador.avisos || []), ...avisosEdicion]);
        setLecturaSingle({ datos: { ...rawDatos }, leido_en: borrador.leido_en || null });
        setUnlockedFields({});
        // Con dos cartas se usa directamente la plantilla de coacreditados
        const sug = borrador.plantilla_sugerida;
        if (rawDatos._coacreditados && sug?.plantilla && esPlantillaCoac(sug.plantilla)) setSelectedPlantilla(sug.plantilla);
        setLoading(false);
      }, 300);
    } catch (err) {
      clearInterval(interval);
      setError(err.response?.data?.detail || 'Error al leer los archivos.');
      setLoading(false);
    }
  };

  // ---- GUARDAR (después de revisar): queda en la base, en Mi Historial, y se genera el Word ----
  const [guardando, setGuardando] = useState({}); // { single: true, <ref>: true }
  const guardarEnBase = async (lista) => {
    const res = await api.post('/expedientes/guardar', { expedientes: lista });
    return res.data.resultados || [];
  };

  // Datos para los KPIs: qué campos se corrigieron a mano y cuándo se leyeron los documentos
  const camposCorregidos = (original, actual) => {
    if (!original || !actual) return [];
    const limpio = (v) => String(v ?? '').trim();
    return Object.keys(actual).filter((k) => !k.startsWith('_') && k !== 'plantilla_seleccionada' && k !== 'texto_raw'
      && typeof actual[k] !== 'object' && limpio(actual[k]) !== limpio(original[k]));
  };
  const metricasDe = (origen, lectura, actual, avisos) => {
    const corregidos = camposCorregidos(lectura?.datos, actual);
    const limpio = (v) => String(v ?? '').trim().replace(/^NO_ENCONTRADO$/i, '');
    return {
      origen,
      leido_en: lectura?.leido_en || null,
      corregidos,
      // Antes -> después de lo que se corrigió a mano (queda en el historial de cambios del expediente)
      cambios: Object.fromEntries(corregidos.map((k) => [k, [limpio(lectura?.datos?.[k]), limpio(actual?.[k])]])),
      avisos: (avisos || []).length,
    };
  };

  // ---- CRÉDITO REPETIDO: antes de guardar se revisa si ese crédito ya se procesó ----
  const confirmarRepetidos = async (creditos, accion = 'guardar') => {
    const nums = [...new Set((creditos || []).map((c) => String(c || '').replace(/\D/g, '')).filter((c) => c.length >= 6))];
    if (nums.length === 0) return true;
    let repetidos = {};
    try {
      repetidos = (await api.get('/expedientes/repetidos', { params: { creditos: nums.join(',') } })).data?.repetidos || {};
    } catch {
      return true; // si no se puede revisar, no se detiene el trabajo
    }
    const claves = Object.keys(repetidos);
    if (claves.length === 0) return true;
    const ESTADO_TXT = { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' };
    const fechaTxt = (iso) => {
      const d = iso ? new Date(iso) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'antes';
    };
    const lineas = claves.slice(0, 8).map((c) => {
      const r = repetidos[c][0];
      const veces = repetidos[c].length > 1 ? ` (${repetidos[c].length} veces)` : '';
      return `• ${c}${r.acreditado ? ` · ${r.acreditado}` : ''}\n   ${fechaTxt(r.fecha)} por ${r.nombre_usuario}${veces} — ${ESTADO_TXT[r.estado] || r.estado}`;
    });
    const cap = accion.charAt(0).toUpperCase() + accion.slice(1);
    return confirmar(
      `${claves.length === 1 ? 'Este crédito ya se procesó antes' : `${claves.length} créditos ya se procesaron antes`}:\n\n${lineas.join('\n')}${claves.length > 8 ? '\n…' : ''}\n\n¿Quieres ${accion} de todas formas?`,
      { titulo: 'Crédito repetido', textoConfirmar: `${cap} de todas formas` },
    );
  };

  // Al guardar: si el crédito ya existe, se puede ACTUALIZAR el expediente que ya estaba (en lugar de crear otro).
  // Regresa null (cancelar), {} (guardar como nuevo) o { credito: expediente_id } (actualizar esos).
  const decidirRepetidos = async (creditos) => {
    const nums = [...new Set((creditos || []).map((c) => String(c || '').replace(/\D/g, '')).filter((c) => c.length >= 6))];
    if (nums.length === 0) return {};
    let repetidos = {};
    try {
      repetidos = (await api.get('/expedientes/repetidos', { params: { creditos: nums.join(',') } })).data?.repetidos || {};
    } catch {
      return {}; // si no se puede revisar, no se detiene el trabajo
    }
    const claves = Object.keys(repetidos);
    if (claves.length === 0) return {};
    if (!puedeServidor('actualizar_existente')) {
      // El servidor todavía no sabe actualizar: solo se ofrece guardar como antes
      return (await confirmarRepetidos(creditos)) ? {} : null;
    }
    const yo = currentUser?.username;
    const admin = currentUser?.es_admin || currentUser?.role === 'admin';
    // El que se actualiza: el más reciente que esta persona puede editar (los suyos; el admin, cualquiera)
    const editable = Object.fromEntries(claves.map((c) => [c, (repetidos[c] || []).find((r) => admin || r.usuario === yo)]).filter(([, r]) => r));
    const ESTADO_TXT = { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' };
    const fechaTxt = (iso) => {
      const d = iso ? new Date(iso) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'antes';
    };
    const lineas = claves.slice(0, 8).map((c) => {
      const r = repetidos[c][0];
      const veces = repetidos[c].length > 1 ? ` (${repetidos[c].length} veces)` : '';
      const ajeno = editable[c] ? '' : ' · de otro usuario';
      return `• ${c}${r.acreditado ? ` · ${r.acreditado}` : ''}\n   ${fechaTxt(r.fecha)} por ${r.nombre_usuario}${veces} — ${ESTADO_TXT[r.estado] || r.estado}${ajeno}`;
    });
    const nEditables = Object.keys(editable).length;
    const uno = claves.length === 1;
    const encabezado = uno ? 'Este crédito ya se procesó antes' : `${claves.length} créditos ya se procesaron antes`;
    if (nEditables === 0) {
      const ok = await confirmar(`${encabezado}:\n\n${lineas.join('\n')}${claves.length > 8 ? '\n…' : ''}\n\nNo lo puedes actualizar porque es de otro usuario. ¿Quieres guardarlo como uno nuevo?`,
        { titulo: 'Crédito repetido', textoConfirmar: 'Guardar como nuevo' });
      return ok ? {} : null;
    }
    const respuesta = await confirmar(
      `${encabezado}:\n\n${lineas.join('\n')}${claves.length > 8 ? '\n…' : ''}\n\n`
      + `«Actualizar» reemplaza los datos del que ya estaba (queda en su historial de cambios y su Word se vuelve a generar). `
      + `«Guardar como nuevo» crea otro expediente.`,
      { titulo: 'Crédito repetido', textoConfirmar: uno || nEditables === 1 ? 'Actualizar el existente' : `Actualizar los existentes (${nEditables})`, textoAlterno: 'Guardar como nuevo' },
    );
    if (respuesta === 'alterno') return {};
    if (!respuesta) return null;
    return Object.fromEntries(Object.entries(editable).map(([c, r]) => [c, r.expediente_id]));
  };
  const soloDigitos = (c) => String(c || '').replace(/\D/g, '');

  const guardarSingle = async () => {
    if (!datos) return;
    const faltan = faltantesPara(datos, selectedPlantilla);
    if (faltan.length > 0 && !(await confirmar(mensajeFaltantes(faltan, 'guardar el expediente'), { titulo: 'Faltan datos', textoConfirmar: 'Guardar de todas formas' }))) return;
    if (edicionSingle) { await guardarEdicionSingle(); return; }
    const actualizar = await decidirRepetidos([datos.numero_credito]);
    if (!actualizar) return;
    setGuardando((g) => ({ ...g, single: true }));
    try {
      const [r] = await guardarEnBase([{ ref: 'single', datos, plantilla: selectedPlantilla, archivos: singleFiles.map((f) => f.name), metricas: metricasDe('individual', lecturaSingle, datos, avisosSingle), actualizar: actualizar[soloDigitos(datos.numero_credito)] || undefined }]);
      if (!r || r.error) throw new Error(r?.error || 'No se pudo guardar');
      setExpedienteId(r.expediente_id);
      guardarPdfs(r.expediente_id, paresSingle());
      avisar.exito(r.actualizado ? 'Se actualizó el expediente que ya existía (su Word se volvió a generar).' : 'Expediente guardado y procesado. Ya está en Mi Historial.');
    } catch (err) {
      avisar.error(`No se pudo guardar: ${err.response?.data?.detail || err.message}`);
    } finally {
      setGuardando((g) => ({ ...g, single: false }));
    }
  };

  // Cambios del expediente que se está editando contra lo que ya estaba guardado
  const cambiosEdicion = () => {
    if (!edicionSingle || !datos) return [];
    const limpio = (v) => String(v ?? '').trim();
    const g = edicionSingle.datos || {};
    // Solo cuentan los datos que el expediente ya tenía (los detalles nuevos que traen los documentos,
    // como el desglose del inmueble, se guardan pero no son "cambios")
    const campos = Object.keys(datos).filter((k) => !k.startsWith('_') && !['plantilla_seleccionada', 'plantilla', 'texto_raw'].includes(k)
      && typeof datos[k] !== 'object' && !esPuntoInmueble(k) && (k in g || CAMPOS_PRINCIPALES.has(k)) && limpio(datos[k]) !== limpio(g[k]));
    if (limpio(selectedPlantilla) !== limpio(edicionSingle.plantilla)) campos.push('plantilla_seleccionada');
    return campos;
  };

  const guardarEdicionSingle = async () => {
    const ed = edicionSingle;
    const cambios = cambiosEdicion();
    // Los PDF que se abrieron del almacenamiento no cuentan como «documentos nuevos»
    const nuevosDocs = singleFiles.filter((f) => !(ed.pdfGuardados || []).includes(f));
    const conDocs = nuevosDocs.length > 0;
    if (cambios.length === 0 && !conDocs) {
      avisar.aviso('No hay cambios por guardar.');
      return;
    }
    const ESTADO_TXT = { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' };
    const lista = cambios.map((k) => (k === 'plantilla_seleccionada' ? 'Plantilla' : etiquetaDe(k)));
    const aviso = ed.estado && ed.estado !== 'GENERADO'
      ? `\n\nEste expediente está «${ESTADO_TXT[ed.estado] || ed.estado}»: al guardar regresa a «Generado», porque su Word cambia.` : '';
    const texto = cambios.length
      ? `Se va a actualizar el expediente de ${ed.nombre} (crédito ${ed.credito || '—'}) con ${cambios.length} cambio(s): ${lista.join(', ')}.`
      : `Se va a actualizar el expediente de ${ed.nombre} (crédito ${ed.credito || '—'}) con los documentos que subiste; los datos quedan igual.`;
    if (!(await confirmar(texto + aviso, { titulo: 'Guardar cambios', textoConfirmar: 'Guardar cambios' }))) return;
    setGuardando((g) => ({ ...g, single: true }));
    try {
      const [r] = await guardarEnBase([{
        ref: 'single', datos, plantilla: selectedPlantilla, archivos: singleFiles.map((f) => f.name),
        metricas: metricasDe('individual', lecturaSingle, datos, avisosSingle),
        actualizar: ed.id, tipo_edicion: conDocs ? 'actualizar' : 'editar',
      }]);
      if (!r || r.error) throw new Error(r?.error || 'No se pudo guardar');
      setExpedienteId(r.expediente_id || ed.id);
      // Lo guardado ahora es la nueva base para comparar
      if (conDocs) guardarPdfs(ed.id, paresSingle().filter(([f]) => f && nuevosDocs.includes(f)));
      setEdicionSingle((prev) => (prev ? { ...prev, datos: { ...datos }, plantilla: selectedPlantilla, estado: 'GENERADO', guardado: true, pdfGuardados: [...singleFiles] } : prev));
      setHistorial((prev) => prev.map((h) => (String(h.id || h.expediente_id) === String(ed.id)
        ? { ...h, ...(r.datos_extraidos ? { datos_extraidos: r.datos_extraidos } : {}), estado: 'GENERADO' } : h)));
      plantillasGuardadas.current[String(ed.id)] = selectedPlantilla;
      avisar.exito('Se guardaron los cambios del expediente y su Word se volvió a generar.');
    } catch (err) {
      avisar.error(`No se pudo guardar: ${err.response?.data?.detail || err.message}`);
    } finally {
      setGuardando((g) => ({ ...g, single: false }));
    }
  };

const handleApplyTemplateToSelected = (plantillaElegida) => {
  if (!plantillaElegida || selectedBatchIndices.length === 0) return;
  const cantidad = selectedBatchIndices.length;
  setBatchResults((prev) => prev.map((item, idx) => (
    selectedBatchIndices.includes(idx) ? { ...item, plantilla_seleccionada: plantillaElegida } : item
  )));
  setSelectedBatchIndices([]);
  avisar.exito(`Plantilla aplicada a ${cantidad} expediente(s).`);
  // Si alguno de ellos está en la vista previa, se actualiza solo
};

  const handleSelectAllBatch = (e) => {
    if (e.target.checked) {
      const allIndices = batchResults.map((_, i) => i);
      setSelectedBatchIndices(allIndices);
    } else {
      setSelectedBatchIndices([]);
    }
  };

  const handleToggleSelectBatch = (index) => {
    setSelectedBatchIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleInputChange = (field, value) => {
    setDatos((prev) => conConversiones(prev, field, value));
  };

  const handleBatchInputChange = (index, field, value) => {
    setBatchResults((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        datos_extraidos: conConversiones(updated[index].datos_extraidos, field, value),
      };
      return updated;
    });
  };

  const handleBatchPlantillaChange = (index, nuevaPlantilla) => {
    setBatchResults((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        plantilla_seleccionada: nuevaPlantilla
      };
      return updated;
    });
    // La vista previa (si está abierta para este expediente) se actualiza sola
  };

  // Clave para mantener juntos los archivos del mismo crédito al mandarlos por partes
  const claveDeArchivo = (nombre) => (String(nombre).match(/\d{8,12}/) || [String(nombre).replace(/\.pdf$/i, '')])[0];

  const aBorrador = (b) => ({
    ref: b.id,
    clave: b.clave,
    archivos: b.archivos || [],
    tipos: b.tipos || {},
    avisos: b.avisos || [],
    error: b.error,
    expediente_id: null,
    plantilla_seleccionada: selectedPlantilla,
    datos_extraidos: b.error ? {} : { numero_credito: b.datos_extraidos?.numero_credito || '', ...b.datos_extraidos },
    lectura: b.error ? null : { datos: { ...(b.datos_extraidos || {}) }, leido_en: b.leido_en || null },
    actos: b.actos || [],
    plantilla_sugerida: b.plantilla_sugerida || null,
  });

  const leerArchivos = async (archivos, agrupar) => {
    const formDataObj = new FormData();
    archivos.forEach((f) => { formDataObj.append('files', f); formDataObj.append('tipos', tipoDeArchivo(f)); });
    formDataObj.append('agrupar', agrupar ? 'true' : 'false');
    const res = await api.post('/expedientes/leer', formDataObj);
    return res.data.borradores || [];
  };

  const handleUploadBatch = async () => {
    cerrarVistaPrevia();
    if (batchFiles.length === 0) return;
    setBatchLoading(true);
    setProgressBatch(5);
    setError('');
    setSelectedBatchIndices([]);

    // Se arman paquetes de ~15 archivos sin separar la carta de su constancia
    const grupos = {};
    batchFiles.forEach((f) => { (grupos[claveDeArchivo(f.name)] ||= []).push(f); });
    const paquetes = [];
    let actual = [];
    Object.values(grupos).forEach((g) => {
      if (actual.length && actual.length + g.length > 40) { paquetes.push(actual); actual = []; }
      actual = actual.concat(g);
    });
    if (actual.length) paquetes.push(actual);

    let leidos = [];
    let hechos = 0;
    try {
      for (const paquete of paquetes) {
        const borradores = await leerArchivos(paquete, true);
        leidos = [...leidos, ...borradores.map(aBorrador)];
        setBatchResults(leidos);
        hechos += paquete.length;
        setProgressBatch(Math.round((hechos / batchFiles.length) * 95));
      }
      setProgressBatch(100);
      setTimeout(() => {
        setUnlockedFields({});
        setBatchLoading(false);
      }, 300);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al leer el lote de archivos.');
      setBatchLoading(false);
    }
  };

  // Mover o quitar archivos de un expediente del lote (solo borradores): se vuelven a leer sus datos
  const releerBorrador = async (ref, archivosNombres) => {
    const archivos = batchFiles.filter((f) => archivosNombres.includes(f.name));
    setBatchResults((prev) => prev.map((r) => (r.ref === ref ? { ...r, archivos: archivosNombres, leyendo: true } : r)));
    try {
      const [b] = await leerArchivos(archivos, false);
      setBatchResults((prev) => prev.map((r) => (r.ref !== ref ? r : {
        ...aBorrador({ ...b, id: ref }),
        plantilla_seleccionada: r.plantilla_seleccionada,
        leyendo: false,
      })));
    } catch {
      setBatchResults((prev) => prev.map((r) => (r.ref === ref ? { ...r, leyendo: false } : r)));
      avisar.error('No se pudieron volver a leer los archivos de ese expediente.');
    }
  };

  const moverArchivoLote = async (nombre, refOrigen, refDestino) => {
    const origen = batchResults.find((r) => r.ref === refOrigen);
    if (!origen) return;
    if (refDestino !== 'nuevo') {
      // Solo se juntan archivos del mismo crédito: si los dos traen número, deben ser idénticos
      const num = numeroEnNombre(nombre);
      const destino = batchResults.find((r) => r.ref === refDestino);
      const otro = (destino?.archivos || []).map(numeroEnNombre).find((n) => n && n !== num);
      if (num && otro) {
        avisar.error(`No se puede mover: "${nombre}" es del crédito ${num} y ese expediente es del ${otro}. Los números deben ser idénticos.`);
        return;
      }
    }
    const restantes = origen.archivos.filter((n) => n !== nombre);
    let destinoRef = refDestino;
    let destinoArchivos;
    if (refDestino === 'nuevo') {
      destinoRef = `nuevo-${Date.now()}`;
      destinoArchivos = [nombre];
      setBatchResults((prev) => [...prev, { ref: destinoRef, clave: claveDeArchivo(nombre), archivos: [nombre], expediente_id: null, plantilla_seleccionada: selectedPlantilla, datos_extraidos: {}, actos: [], leyendo: true }]);
    } else {
      const destino = batchResults.find((r) => r.ref === refDestino);
      destinoArchivos = [...(destino?.archivos || []), nombre];
    }
    setSelectedBatchIndices([]);
    if (restantes.length === 0) {
      setBatchResults((prev) => prev.filter((r) => r.ref !== refOrigen));
    }
    await Promise.all([
      restantes.length ? releerBorrador(refOrigen, restantes) : null,
      releerBorrador(destinoRef, destinoArchivos),
    ]);
    avisar.exito(`"${nombre}" se movió${refDestino === 'nuevo' ? ' a un expediente nuevo' : ''}. Se volvieron a leer los datos.`);
  };

  const quitarArchivoLote = async (nombre, ref) => {
    const item = batchResults.find((r) => r.ref === ref);
    if (!item) return;
    const restantes = item.archivos.filter((n) => n !== nombre);
    setSelectedBatchIndices([]);
    if (restantes.length === 0) {
      if (!(await confirmar(`El expediente se queda sin archivos y se quitará de la lista.`, { titulo: `¿Quitar "${nombre}"?`, textoConfirmar: 'Quitar' }))) return;
      setBatchResults((prev) => prev.filter((r) => r.ref !== ref));
      return;
    }
    await releerBorrador(ref, restantes);
    avisar.exito(`Se quitó "${nombre}" y se volvieron a leer los datos.`);
  };

  const quitarExpedienteLote = (ref) => {
    setSelectedBatchIndices([]);
    setBatchResults((prev) => prev.filter((r) => r.ref !== ref));
  };
  // Quita de la lista todos los expedientes marcados con la casilla
  const quitarMarcadosLote = async () => {
    const marcados = selectedBatchIndices.map((i) => batchResults[i]).filter(Boolean);
    if (marcados.length === 0) return;
    const sinGuardar = marcados.filter((r) => !r.error && !r.expediente_id).length;
    const guardados = marcados.filter((r) => r.expediente_id).length;
    const partes = [];
    if (sinGuardar) partes.push(`${sinGuardar} sin guardar (se pierden sus datos leídos y lo que hayas corregido)`);
    if (guardados) partes.push(`${guardados} ya guardado(s) (siguen en Mi Historial; solo se quitan de esta lista)`);
    const otros = marcados.length - sinGuardar - guardados;
    if (otros) partes.push(`${otros} con error de lectura`);
    if (!(await confirmar(`Se quitarán de la lista ${marcados.length} expediente(s):\n\n• ${partes.join('\n• ')}`,
      { titulo: 'Descartar marcados', textoConfirmar: `Descartar ${marcados.length}`, peligro: sinGuardar > 0 }))) return;
    const refs = new Set(marcados.map((r) => r.ref));
    setSelectedBatchIndices([]);
    setBatchResults((prev) => prev.filter((r) => !refs.has(r.ref)));
    avisar.exito(`Se quitaron ${marcados.length} expediente(s) de la lista.`);
  };

  // Guarda en la base los expedientes indicados (por índice); regresa { ref: expediente_id } de los guardados
  const guardarLote = async (indices) => {
    const items = indices.map((i) => ({ i, r: batchResults[i] })).filter(({ r }) => r && !r.error && !r.expediente_id && !r.leyendo);
    if (items.length === 0) return {};
    const conFaltantes = items.filter(({ r }) => faltantesPara(r.datos_extraidos, r.plantilla_seleccionada || selectedPlantilla).length > 0);
    if (conFaltantes.length > 0 && !(await confirmar(
      `${conFaltantes.length} de ${items.length} expediente(s) tienen datos faltantes (marcados con ⚠).\n\n¿Quieres guardarlos de todas formas?`,
      { titulo: 'Expedientes incompletos', textoConfirmar: 'Guardar de todas formas' }
    ))) return {};
    const actualizar = await decidirRepetidos(items.map(({ r }) => r.datos_extraidos?.numero_credito));
    if (!actualizar) return {};
    const refs = Object.fromEntries(items.map(({ r }) => [r.ref, true]));
    setGuardando((g) => ({ ...g, ...refs }));
    const nuevosIds = {};
    try {
      const resultados = await guardarEnBase(items.map(({ r }) => ({
        ref: r.ref, datos: r.datos_extraidos, plantilla: r.plantilla_seleccionada || selectedPlantilla, archivos: r.archivos,
        metricas: metricasDe('masivo', r.lectura, r.datos_extraidos, r.avisos),
        actualizar: actualizar[soloDigitos(r.datos_extraidos?.numero_credito)] || undefined,
      })));
      const porRef = Object.fromEntries(resultados.map((x) => [x.ref, x]));
      const guardados = resultados.filter((x) => !x.error && !x.actualizado).length;
      const actualizados = resultados.filter((x) => !x.error && x.actualizado).length;
      resultados.forEach((x) => { if (!x.error) nuevosIds[x.ref] = x.expediente_id; });
      setBatchResults((prev) => prev.map((r) => {
        const x = porRef[r.ref];
        return x && !x.error ? { ...r, expediente_id: x.expediente_id, actualizado: !!x.actualizado } : r;
      }));
      // Sus PDF se guardan en segundo plano (si el almacenamiento está configurado)
      const subirPdfs = resultados.filter((x) => !x.error && x.expediente_id).map((x) => {
        const r = items.find((it) => it.r.ref === x.ref)?.r;
        if (!r) return null;
        let cartas = 0;
        const pares = archivosDeLote(r).map((f) => {
          const t = r.tipos?.[f.name] || tipoDeArchivo(f);
          if (t === 'constancia') return [f, 'constancia'];
          cartas += 1;
          return [f, cartas > 1 ? 'carta2' : 'carta'];
        });
        return [x.expediente_id, pares];
      }).filter(Boolean);
      if (subirPdfs.length && puedeServidor('documentos')) {
        (async () => {
          let fallas = 0;
          for (const [id, pares] of subirPdfs) if (!(await guardarPdfs(id, pares, { silencioso: true }))) fallas += 1;
          if (fallas) avisar.aviso(`Los expedientes se guardaron, pero los PDF de ${fallas} no se pudieron guardar. Al editarlos puedes subirlos de nuevo.`);
        })();
      }
      const errores = resultados.filter((x) => x.error);
      if (errores.length) avisar.error(`${errores.length} expediente(s) no se pudieron guardar: ${errores[0].error}`);
      if (guardados) avisar.exito(`${guardados} expediente(s) guardados y procesados. Ya están en Mi Historial.`);
      if (actualizados) avisar.exito(`${actualizados} expediente(s) que ya existían se actualizaron.`);
    } catch (err) {
      avisar.error(`No se pudo guardar: ${err.response?.data?.detail || err.message}`);
    } finally {
      setGuardando((g) => Object.fromEntries(Object.entries(g).filter(([k]) => !refs[k])));
    }
    return nuevosIds;
  };

// Plantilla con la que se guardó un expediente: primero la del historial ya cargado; si no viene ahí
// (servidores anteriores no la mandaban en la lista), se pregunta a su historial de cambios.
const plantillasGuardadas = React.useRef({});
const plantillaGuardada = async (id) => {
  const clave = String(id || '');
  if (!clave) return null;
  if (plantillasGuardadas.current[clave] !== undefined) return plantillasGuardadas.current[clave];
  const fila = (historial || []).find((h) => String(h.id || h.expediente_id) === clave);
  const d = fila?.datos_extraidos || {};
  let p = d.plantilla_seleccionada || d.plantilla || fila?.plantilla_seleccionada || null;
  if (!p) {
    try {
      const r = await api.get(`/expedientes/${clave}/bitacora`);
      p = r.data?.plantilla || r.data?.info?.plantilla || null;
    } catch { p = null; }
  }
  plantillasGuardadas.current[clave] = p;
  return p;
};

// 📥 Función de descarga con el nombre basado en el Número de Crédito
const handleDownloadWord = async (expedienteId, datosParam = null, plantillaParam = null, opciones = {}) => {
  try {
    const idReal = expedienteId;
    if (!idReal) {
      avisar.error("Error: No se encontró un ID de expediente válido para la descarga.");
      return;
    }

    // Cada expediente se descarga con SU plantilla (la que se guardó). Si no la conocemos aquí
    // (por ejemplo, en Mi Historial), NO se manda ninguna y el servidor usa la que tiene guardada.
    // Antes se mandaba la plantilla seleccionada en pantalla (por defecto CDMX Ap. Crédito Hombre Soltero)
    // y el Word salía con esa.
    const plantillaUsar = plantillaParam || (await plantillaGuardada(idReal)) || null;
    if (plantillaUsar) {
      const faltan = faltantesPara(datosParam || datos, plantillaUsar);
      if (faltan.length > 0 && !(await confirmar(mensajeFaltantes(faltan), { titulo: 'Faltan datos', textoConfirmar: 'Generar de todas formas' }))) return;
    }

    setDescargandoId(idReal);
    const response = await api.post(
      `/expedientes/${idReal}/generar-word`,
      {
        ...(plantillaUsar ? { plantilla: plantillaUsar } : {}),
        datos: datosParam || datos,
        // true: con la plantilla actual; si no, con la misma versión con la que se generó la primera vez
        plantilla_actual: !!opciones.plantillaActual,
      },
      { responseType: 'blob' }
    );

    // 👇 Extraemos el número de crédito de los datos para ponérselo al nombre del archivo
    const datosObj = datosParam || datos || {};
    const numeroCredito = datosObj.numero_credito || datosObj.credito || idReal;

    const blob = new Blob([response.data], { 
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    });
    
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `Cancelacion_Credito_${numeroCredito}.docx`; // 👈 Aquí usa el número de crédito
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
    avisar.exito(`Word del crédito ${numeroCredito} descargado.`);
    if (opciones.plantillaActual) {
      setHistorial((prev) => prev.map((h) => (String(h.id || h.expediente_id) === String(idReal) ? { ...h, plantilla_cambio: false } : h)));
    }

  } catch (err) {
    console.error("Error al descargar el archivo Word:", err);
    avisar.error("No se pudo descargar el archivo Word desde el servidor.");
  } finally {
    setDescargandoId(null);
  }
};



const handleExcelSubmit = async (e) => {
  e.preventDefault();
  if (!archivoExcel) return avisar.aviso('Por favor selecciona un archivo Excel (.xlsx o .csv)');
  if (!filasSeleccionadas || filasSeleccionadas.length === 0) {
    return avisar.aviso('Selecciona al menos una fila en la tabla para procesar.');
  }

  setCargando(true);
  setProgreso(0);

  const nuevosEstados = {};
  filasSeleccionadas.forEach(idx => {
    nuevosEstados[idx] = 'pendiente';
  });
  setEstadoFilas(nuevosEstados);

  let totalExitosos = 0;
  let todosLosDetalles = [];
  const idsCreados = []; // 📦 Array para recolectar los IDs para el ZIP
  const totalSeleccionadas = filasSeleccionadas.length;

  try {
    // 1. Procesamos cada fila del lote de forma secuencial
    for (let i = 0; i < filasSeleccionadas.length; i++) {
      const index = filasSeleccionadas[i];
      
      setEstadoFilas(prev => ({ ...prev, [index]: 'procesando' }));
      setTextoProgreso(`Procesando documento ${i + 1} de ${totalSeleccionadas} (Registro ${index + 1})...`);

      // 📜 Obtenemos la plantilla específica de la fila o la global por defecto
      const plantillaFila = plantillasFilas?.[index] || selectedPlantilla || 'plantilla_manera2.docx';

      const dataForm = new FormData();
      dataForm.append('file', archivoExcel);
      dataForm.append('plantilla', plantillaFila);
      dataForm.append('usuario_propietario', currentUser?.username || 'admin');
      dataForm.append('indices_bloque', JSON.stringify([index]));

      const res = await fetch(`${API_BASE}/api/expedientes/procesar-excel`, {
        method: 'POST',
        credentials: 'include',
        headers: encabezadosSesion(),
        body: dataForm
      });
      const data = await res.json();

      if (!res.ok || data.status !== 'exito') {
        setEstadoFilas(prev => ({ ...prev, [index]: 'error' }));
        throw new Error(data.detail || `Fallo al procesar el registro ${index + 1}`);
      }

      // Marcar fila como 'completado'
      setEstadoFilas(prev => ({ ...prev, [index]: 'completado' }));

      totalExitosos += data.procesados;
      if (Array.isArray(data.detalles)) {
        todosLosDetalles.push(...data.detalles);
        // Extraemos los IDs de los expedientes generados para pasárselos al ZIP
        data.detalles.forEach(exp => {
          if (exp.id) idsCreados.push(exp.id);
        });
      }

      const porcentajeActual = Math.round(((i + 1) / totalSeleccionadas) * 100);
      setProgreso(porcentajeActual);
    }

    setTextoProgreso(`¡Lote procesado! Empaquetando documentos en ZIP...`);
    
    if (typeof setExpedientes === 'function' && Array.isArray(todosLosDetalles)) {
      setExpedientes([...todosLosDetalles, ...expedientes]);
    }

    // 2. DISPARAR LA DESCARGA DEL ZIP USANDO TU ENDPOINT EXISTENTE
    if (idsCreados.length > 0) {
      const resZip = await fetch(`${API_BASE}/api/expedientes/descargar-zip`, {
        method: 'POST',
        credentials: 'include',
        headers: encabezadosSesion({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(idsCreados),
      });

      if (!resZip.ok) throw new Error("Error al generar el archivo ZIP del lote.");

      const blob = await resZip.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Cancelaciones_Lote.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }

    // 3. 🕒 INICIAR CONTADOR DE 5 SEGUNDOS Y LIMPIEZA TOTAL DE LA DROP ZONE
    let segundosRestantes = 5;
    const contadoresIniciales = {};
    filasSeleccionadas.forEach(idx => {
      contadoresIniciales[idx] = segundosRestantes;
    });
    setContadoresRemosion(contadoresIniciales);

    const timerInterval = setInterval(() => {
      segundosRestantes -= 1;
      if (segundosRestantes > 0) {
        const contadoresActualizados = {};
        filasSeleccionadas.forEach(idx => {
          contadoresActualizados[idx] = segundosRestantes;
        });
        setContadoresRemosion(contadoresActualizados);
      } else {
        clearInterval(timerInterval);
        
        // Limpieza automática final
        setArchivoExcel(null);
        setFilasPreview([]);
        setFilasSeleccionadas([]);
        setEstadoFilas({});
        setContadoresRemosion({});
        setProgreso(0);
        setTextoProgreso("");
      }
    }, 1000);

  } catch (err) {
    console.error(err);
    avisar.error('Error en lote: ' + err.message);
  } finally {
    setCargando(false);
  }
};

  const handleDownloadZip = async () => {
    const pendientes = batchResults.map((r, i) => (!r.error && !r.expediente_id ? i : null)).filter((i) => i !== null);
    if (pendientes.length > 0) {
      if (!(await confirmar(`${pendientes.length} expediente(s) todavía no están guardados. Para incluirlos en el ZIP hay que guardarlos primero.`, { titulo: 'Hay expedientes sin guardar', textoConfirmar: 'Guardar y descargar' }))) return;
      const nuevosIds = await guardarLote(pendientes);
      // Solo entran al ZIP los que ya están guardados
      return descargarZipGuardados(batchResults.map((r) => (nuevosIds[r.ref] ? { ...r, expediente_id: nuevosIds[r.ref] } : r)), true);
    }
    return descargarZipGuardados(batchResults, false);
  };

  const descargarZipGuardados = async (lista, yaConfirmado) => {
    const conFaltantes = yaConfirmado ? [] : lista.filter((r) => !r.error && r.expediente_id && faltantesPara(
      r.datos_extraidos,
      r.plantilla_seleccionada || r.datos_extraidos?.plantilla_seleccionada || selectedPlantilla
    ).length > 0);
    if (conFaltantes.length > 0 && !await confirmar(
      `${conFaltantes.length} de ${batchResults.length} expediente(s) tienen datos faltantes (están marcados con ⚠ en la lista).\n\n¿Quieres descargar el ZIP de todas formas?`
    , { titulo: 'Expedientes incompletos', textoConfirmar: 'Descargar de todas formas' })) return;

    // Se mandan la plantilla y los datos actuales de cada expediente,
    // para que el ZIP incluya los cambios hechos en pantalla
    const guardados = lista.filter((r) => !r.error && r.expediente_id);
    if (guardados.length === 0) { avisar.aviso('No hay expedientes guardados para descargar.'); return; }
    const ids = guardados.map((r) => ({
      id: r.expediente_id,
      plantilla: r.plantilla_seleccionada || selectedPlantilla,
      datos: r.datos_extraidos,
    }));
    setDescargandoZip(true);
    try {
      const res = await api.post('/expedientes/descargar-zip', ids, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Cancelaciones_Lote.zip');
      document.body.appendChild(link);
      link.click();
      link.remove();
      avisar.exito('ZIP descargado.');
    } catch (err) {
      setError('Error al descargar el archivo ZIP.');
    } finally {
      setDescargandoZip(false);
    }
  };

  const formatLabel = (key) => etiquetaDe(key);

  const esAdmin = currentUser?.es_admin || currentUser?.role === 'admin';
  // Usuario de revisión: no hace expedientes, solo revisa/edita/descarga los que le comparten
  const esRevisor = !esAdmin && currentUser?.role === 'revisor';
  const puedeCompartir = puedeServidor('compartir') && !esRevisor;
  // «Compartidos conmigo» va en el menú de los operadores (y del revisor); al admin le sale cuando alguien le comparte algo.
  // Si un admin tiene algo compartido de antes, también se le muestra.
  const verCompartidos = puedeServidor('compartir') && (!esAdmin || hayCompartidos);
  const abrirCompartir = (opciones) => setModalCompartir(opciones || null);
  const PESTANAS_OPERADOR = ['single', 'batch', 'manual', 'excel', 'history', 'users', 'kpis', 'templates'];

  // Al entrar: ¿le han compartido algo? (para mostrar «Compartidos conmigo» en el menú)
  useEffect(() => {
    if (!isAuthenticated || !puedeServidor('compartir')) return undefined;
    let vivo = true;
    api.get('/compartidos').then((r) => { if (vivo) setHayCompartidos((r.data || []).length > 0); }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentUser?.username, funcionesServidor]);

  // El revisor solo ve «Compartidos conmigo» (y Caso Individual mientras edita uno)
  // (se ajusta durante el render, antes de dibujar la pestaña que no le corresponde)
  if (esRevisor && PESTANAS_OPERADOR.includes(activeTab) && !(activeTab === 'single' && edicionSingle)) setActiveTab('compartidos');
  // --- CÁLCULOS DINÁMICOS DE FECHAS, SEMANAS Y DÍAS DEL MES ---
  const getWeekOfMonth = (date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    return Math.ceil((date.getDate() + firstDay.getDay()) / 7);
  };

  const daysInSelectedMonth = new Date(Number(selectedYear), Number(selectedMonth) + 1, 0).getDate();

  const mesesNombres = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

 // HELPER: Extrae Año, Mes (0-11) y Día de cualquier tipo de fecha/string
const parsearFechaExpediente = (item) => {
  // fecha_creacion trae zona horaria: se convierte a la hora local (México) correctamente.
  // "fecha" viene ya formateada por el servidor en hora UTC, por eso queda como respaldo.
  const rawDate = item.fecha_creacion || item.created_at || item.createdAt || item.fecha;
  if (!rawDate) return null;

  let year = null, month = null, day = null, horaStr = '00:00';
  const esISO = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(rawDate);

  // Caso 1: String en formato "DD-MM-YYYY" o "DD/MM/YYYY" (ej. "15-09-2026")
  if (!esISO && typeof rawDate === 'string' && (rawDate.includes('-') || rawDate.includes('/'))) {
    const separador = rawDate.includes('-') ? '-' : '/';
    const partes = rawDate.split(' ')[0].split(separador); // Separa fecha de hora si existe
    
    if (partes.length === 3) {
      if (partes[0].length === 2) { 
        // Formato DD-MM-YYYY
        day = parseInt(partes[0], 10);
        month = parseInt(partes[1], 10) - 1; // JS usa meses 0-11
        year = parseInt(partes[2], 10);
      } else if (partes[0].length === 4) { 
        // Formato YYYY-MM-DD
        year = parseInt(partes[0], 10);
        month = parseInt(partes[1], 10) - 1;
        day = parseInt(partes[2], 10);
      }
    }
    
    // Si contiene hora en el string (ej. "15-09-2026 14:30")
    if (rawDate.includes(' ')) {
      horaStr = rawDate.split(' ')[1];
    }
  } else {
    // Caso 2: Objeto Date o Timestamp ISO
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      day = d.getDate();
      month = d.getMonth();
      year = d.getFullYear();
      horaStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/\s+/g, ' ');
    }
  }

  if (year === null || isNaN(year)) return null;

  return {
    year,
    month,
    day,
    fechaTexto: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`,
    horaTexto: horaStr
  };
};

// LÓGICA DE FILTRADO CORREGIDA
const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const historialSinEstado = (historial || []).filter((item) => {
  const parsed = parsearFechaExpediente(item);

  // Búsqueda rápida: nombre (acreditado, cónyuge o trabajador dos), crédito, folio o número de carta
  if (searchQuery && searchQuery.trim() !== '') {
    const q = sinAcentos(searchQuery.trim());
    const qDigitos = searchQuery.replace(/\D/g, '');
    const d = item.datos_extraidos || {};
    const textos = [d.acreditado, d.nombre_acreditado, item.nombre_acreditado, d.nombre_conyuge, d.nombre_acreditado_2, item.acreditado].map(sinAcentos);
    const numeros = [d.numero_credito, item.numero_credito, d.numero_credito_2, d.folio_real, d.numero_carta, d.numero_carta_2]
      .map((v) => String(v ?? ''));
    const porTexto = textos.some((t) => t.includes(q)) || numeros.some((n) => sinAcentos(n).includes(q));
    // Con números se busca dentro de los dígitos (el folio y la carta vienen como "37509" (treinta y siete...))
    const porNumero = qDigitos.length >= 3 && qDigitos.length === searchQuery.replace(/[\s"]/g, '').length
      && numeros.some((n) => (n.match(/\d+/g) || []).some((g) => g.includes(qDigitos)));
    if (!porTexto && !porNumero) return false;
  }

  // Si no se eligió un periodo específico, mostrar todo
  if (filterPeriod === 'all') return true;

  // Si no se pudo procesar la fecha del registro, se omite de los filtros por fecha
  if (!parsed) return false;

  const targetYear = parseInt(selectedYear, 10);
  const targetMonth = parseInt(selectedMonth, 10); // 0 = Enero, 8 = Septiembre

  // Filtro por Año
  if (filterPeriod === 'year') {
    return parsed.year === targetYear;
  }

  // Filtro por Mes
  if (filterPeriod === 'month') {
    return parsed.year === targetYear && parsed.month === targetMonth;
  }

  // Filtro por Día
  if (filterPeriod === 'day') {
    const matchesYearMonth = parsed.year === targetYear && parsed.month === targetMonth;
    if (!matchesYearMonth) return false;
    if (selectedDay === 'all') return true;
    return parsed.day === parseInt(selectedDay, 10);
  }

  return true;
}).sort((a, b) => {
  const dExtraA = a.datos_extraidos || {};
  const dExtraB = b.datos_extraidos || {};
  const nomA = (dExtraA.acreditado || dExtraA.nombre_acreditado || a.nombre_acreditado || '').toLowerCase();
  const nomB = (dExtraB.acreditado || dExtraB.nombre_acreditado || b.nombre_acreditado || '').toLowerCase();
  
  return sortAscending ? nomA.localeCompare(nomB) : nomB.localeCompare(nomA);
});
const esIncidencia = (item) => revisarIncidencia(item.datos_extraidos).incidencia;
const filteredHistorial = filtroEstado === 'todos'
  ? historialSinEstado
  : filtroEstado === 'INCIDENCIA'
    ? historialSinEstado.filter(esIncidencia)
    : historialSinEstado.filter((item) => (item.estado || 'GENERADO') === filtroEstado);
const conteoEstados = historialSinEstado.reduce((acc, item) => {
  const e = item.estado || 'GENERADO';
  acc[e] = (acc[e] || 0) + 1;
  if (esIncidencia(item)) acc.INCIDENCIA = (acc.INCIDENCIA || 0) + 1;
  return acc;
}, {});

// Cambia el estado de uno o varios expedientes (Generado -> Revisado -> Entregado)
const cambiarEstado = async (ids, estado) => {
  const lista = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!lista.length) return false;
  try {
    if (lista.length === 1) await api.put(`/expedientes/${lista[0]}/estado`, { estado });
    else await api.post('/expedientes/estado', { ids: lista, estado });
    const set = new Set(lista.map(String));
    setHistorial((prev) => prev.map((h) => (set.has(String(h.id || h.expediente_id)) ? { ...h, estado } : h)));
    const txt = { GENERADO: 'Generado', REVISADO: 'Revisado', ENTREGADO: 'Entregado' }[estado];
    avisar.exito(lista.length === 1 ? `Estado: ${txt}` : `${lista.length} expedientes marcados como ${txt}`);
    return true;
  } catch (err) {
    avisar.error(`No se pudo cambiar el estado: ${err.response?.data?.detail || err.message}`);
    return false;
  }
};

  const theme = {
    bg: isDarkMode ? '#0a0f1a' : '#f8fafc',
    cardBg: isDarkMode ? '#121a2b' : '#ffffff',
    textPrimary: isDarkMode ? '#f1f5f9' : '#0f172a',
    textSecondary: isDarkMode ? '#a8b3c7' : '#64748b',
    border: isDarkMode ? '#2a3650' : '#e2e8f0',
    inputBg: isDarkMode ? '#0d1424' : '#ffffff',
    subtleBg: isDarkMode ? '#1b2539' : '#f1f5f9',
    dropzoneBg: isDarkMode ? '#0f1729' : '#f8fafc',
    dropzoneBorder: isDarkMode ? `${acento}aa` : `${acento}66`,
    accent: acento,
  };

  // ---- DOCUMENTOS DEL EXPEDIENTE (visor de PDF: seleccionar texto / elegir acto) ----
  // destino: { origen: 'single' } o { origen: 'batch', index }
  const esPdf = (f) => /\.pdf$/i.test(f.name);
  const archivosSingle = singleFiles.filter(esPdf);
  const archivosDeLote = (item) => {
    const nombres = item?.archivos || [];
    return batchFiles.filter((f) => esPdf(f) && nombres.includes(f.name));
  };

  // Pone uno o varios datos en el expediente indicado
  const ponerCamposEn = (destino, cambios) => {
    if (!destino) return;
    if (destino.origen === 'single') {
      setDatos((prev) => ({ ...prev, ...cambios }));
    } else {
      const idx = destino.index;
      setBatchResults((prev) => prev.map((item, i) => (i !== idx ? item : {
        ...item,
        datos_extraidos: { ...item.datos_extraidos, ...cambios },
      })));
    }
  };

  // Deja el Caso Individual vacío (sin preguntar)
  const limpiarSingle = () => {
    cerrarVistaPrevia();
    setDatos(null); setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]); setLecturaSingle(null);
    setCartaSingle(null); setConstanciaSingle(null); setCarta2Single(null); setCoacManual(false); setExpedienteId(''); setError(''); setProgressSingle(0);
    setUnlockedFields({});
    setEdicionSingle(null);
    turnoPdfs.current += 1; setCargandoPdfs(false);
  };
  // ¿Hay algo sin guardar en el Caso Individual?
  const pendienteSingle = () => {
    if (!datos || expedienteId) return false;
    return edicionSingle ? (cambiosEdicion().length > 0 || singleFiles.some((f) => !(edicionSingle.pdfGuardados || []).includes(f))) : true;
  };

  // Empieza un expediente nuevo en Caso Individual
  const nuevoExpedienteSingle = async () => {
    if (pendienteSingle() && !(await confirmar('Este expediente todavía no está guardado; si continúas se pierden los datos leídos y lo que hayas corregido.', { titulo: '¿Descartar el expediente?', textoConfirmar: 'Descartar', peligro: true }))) return;
    limpiarSingle();
  };

  // ---- EDITAR UN EXPEDIENTE GUARDADO (desde Mi Historial) ----
  // Se abre en el mismo espacio de trabajo que un expediente nuevo: documentos, visor, actos, «Usar como…»,
  // vista previa… y al guardar se ACTUALIZA el expediente que ya existía.
  const iniciarEdicionSingle = async (item) => {
    const id = String(item.id || item.expediente_id || '');
    if (!id) return;
    if (pendienteSingle() && !(await confirmar('En Caso Individual tienes un expediente sin guardar; si continúas se pierde.', { titulo: '¿Descartar el expediente?', textoConfirmar: 'Descartar y editar', peligro: true }))) return;
    const d = { ...(item.datos_extraidos || {}) };
    const plantilla = d.plantilla_seleccionada || d.plantilla || (await plantillaGuardada(id)) || selectedPlantilla;
    limpiarSingle();
    setEdicionSingle({
      id,
      origen: activeTab === 'compartidos' ? 'compartidos' : 'history',
      nombre: d.nombre_acreditado || item.acreditado || 'Expediente',
      credito: d.numero_credito || item.numero_credito || '',
      estado: item.estado || 'GENERADO',
      datos: d,
      plantilla,
    });
    setSelectedPlantilla(plantilla);
    if (d._coacreditados || esPlantillaCoac(plantilla)) setCoacManual(true);
    // Con PDF guardados se abre directo el editor completo: mientras se revisan se muestra «Abriendo…»
    const conPdfs = puedeServidor('documentos');
    if (conPdfs) setCargandoPdfs(true);
    cambiarPestana('single');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (conPdfs) abrirPdfsGuardados(id, d);
  };

  // ---- PDF guardados (Backblaze B2): se guardan con el expediente y se abren solos al editarlo ----
  const paresSingle = () => [[cartaSingle, 'carta'], [carta2Single, 'carta2'], [constanciaSingle, 'constancia']];
  const guardarPdfs = async (expId, pares, { silencioso = false } = {}) => {
    if (!expId || !puedeServidor('documentos')) return true;
    const lista = (pares || []).filter(([f, t]) => f && t && /\.pdf$/i.test(f.name));
    if (!lista.length) return true;
    const fd = new FormData();
    lista.forEach(([f, t]) => { fd.append('archivos', f); fd.append('tipos', t); });
    try {
      await api.post(`/expedientes/${expId}/documentos`, fd);
      return true;
    } catch (err) {
      if (!silencioso) avisar.aviso(`El expediente se guardó, pero sus PDF no se pudieron guardar (${err.response?.data?.detail || err.message}). Al editarlo puedes subirlos de nuevo.`);
      return false;
    }
  };
  const abrirPdfsGuardados = async (id, d) => {
    const turno = ++turnoPdfs.current;
    let docs;
    try {
      docs = (await api.get(`/expedientes/${id}/documentos`)).data?.documentos || [];
    } catch { docs = []; }
    if (turno !== turnoPdfs.current) return;
    if (!docs.length) { setCargandoPdfs(false); return; } // sin PDF guardados: se muestra para subirlos
    setCargandoPdfs(true);
    try {
      const pares = await Promise.all(docs.map(async (doc) => {
        const r = await api.get(`/documentos/${doc.id}/archivo`, { responseType: 'blob' });
        return [doc.tipo, new File([r.data], doc.nombre, { type: 'application/pdf' })];
      }));
      if (turno !== turnoPdfs.current) return; // la persona ya salió o abrió otro expediente
      const por = Object.fromEntries(pares);
      setCartaSingle(por.carta || null); setCarta2Single(por.carta2 || null); setConstanciaSingle(por.constancia || null);
      if (por.carta2) setCoacManual(true);
      setEdicionSingle((prev) => (prev && prev.id === id ? { ...prev, pdfGuardados: Object.values(por) } : prev));
      // Se abre con los datos guardados y sus PDF en el visor (selección de texto, OCR…)
      // (si mientras tanto ya dio «Continuar sin documentos», se respetan los cambios que lleve)
      setDatos((prev) => prev || { ...d }); setLecturaSingle((prev) => prev || { datos: { ...d }, leido_en: null });
      // En segundo plano, los actos de la constancia (sin cambiar los datos guardados)
      if (por.constancia) {
        const fd = new FormData();
        pares.forEach(([t, f]) => { fd.append('files', f); fd.append('tipos', t); });
        fd.append('agrupar', 'false');
        fd.append('motivo', 'pdf_guardados');
        api.post('/expedientes/leer', fd).then((res) => {
          const b = res.data?.borradores?.[0];
          if (b && !b.error && turno === turnoPdfs.current) { setActosSingle(b.actos || []); setSugerenciaBase(b.plantilla_sugerida || null); }
        }).catch(() => {});
      }
    } catch {
      if (turno === turnoPdfs.current) avisar.aviso('No se pudieron abrir los PDF guardados. Puedes continuar sin documentos o subirlos.');
    } finally {
      if (turno === turnoPdfs.current) setCargandoPdfs(false);
    }
  };
  // Editar con los datos guardados, sin volver a subir los documentos
  const editarSinDocumentos = () => {
    if (!edicionSingle) return;
    cerrarVistaPrevia();
    const d = { ...edicionSingle.datos };
    setDatos(d);
    setLecturaSingle({ datos: { ...d }, leido_en: null });
    setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]); setExpedienteId('');
    setUnlockedFields({});
  };
  // Editando sin documentos: regresar a subirlos (lo que se haya cambiado en pantalla se pierde)
  const volverADocumentos = async () => {
    if (cambiosEdicion().length > 0 && !(await confirmar('Al subir los documentos se vuelven a leer y se pierden los cambios que hiciste en pantalla.', { titulo: '¿Subir documentos?', textoConfirmar: 'Sí, subir documentos' }))) return;
    cerrarVistaPrevia();
    setDatos(null); setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]); setLecturaSingle(null); setExpedienteId('');
  };
  // Salir de la edición y regresar a Mi Historial
  const salirEdicionSingle = async () => {
    if (pendienteSingle() && !(await confirmar('Los cambios que hiciste no se han guardado y se perderán.', { titulo: '¿Salir sin guardar?', textoConfirmar: 'Salir sin guardar', peligro: true }))) return;
    const origen = edicionSingle?.origen || 'history';
    limpiarSingle();
    cambiarPestana(origen);
  };

  // Coacreditados: ya leído el expediente, se agrega la carta del trabajador dos y se vuelve a leer
  const agregarCarta2Single = async (archivos) => {
    const pdf = Array.from(archivos || []).find((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdf) { avisar.aviso('Elige un archivo PDF.'); return; }
    if (cartaSingle && pdf.name === cartaSingle.name && pdf.size === cartaSingle.size) {
      avisar.error('Es la misma carta del trabajador uno. Elige la carta del trabajador dos.');
      return;
    }
    // Igual que las demás plantillas: el número del nombre debe ser idéntico al de los otros archivos
    const nuevo = numeroEnNombre(pdf.name);
    const otro = [cartaSingle, constanciaSingle].map((f) => numeroEnNombre(f?.name)).find((n) => n && n !== nuevo);
    if (nuevo && otro) {
      avisar.error(`La carta del trabajador dos es del ${nuevo} y los otros archivos del ${otro}. Los números deben ser idénticos.`);
      return;
    }
    const corregidos = camposCorregidos(lecturaSingle?.datos, datos).length;
    if (corregidos > 0 && !(await confirmar(`Se vuelven a leer los documentos con la carta del trabajador dos y se pierden ${corregidos} dato(s) que corregiste.`, { titulo: '¿Volver a leer?', textoConfirmar: 'Sí, volver a leer' }))) return;
    setCarta2Single(pdf);
    const lista = [cartaSingle, pdf, constanciaSingle].filter(Boolean);
    await leerSingle(lista, (f) => (f === pdf ? 'carta2' : (f === cartaSingle ? 'carta' : 'constancia')));
  };

  // Da al texto el mismo formato que la extracción automática (si el servidor no responde, se usa tal cual)
  const normalizarCampo = async (campo, texto) => {
    try {
      const res = await api.post('/expedientes/normalizar-campo', { campo, texto });
      return { valor: res.data?.valor || texto, extra: res.data?.extra || {} };
    } catch {
      return { valor: texto, extra: {} };
    }
  };

  const asignarCampoDesdeDocumento = async (campo, texto, destino) => {
    const { valor, extra } = await normalizarCampo(campo, texto);
    ponerCamposEn(destino, { [campo]: valor, ...extra });
    avisar.exito(`${etiquetaDe(campo)}: ${valor.length > 60 ? valor.slice(0, 60) + '…' : valor}`);
  };

  const usarActo = async (acto, destino) => {
    if (!destino || !acto?.datos) return;
    if (!CAMPOS_DEL_ACTO.some((c) => acto.datos[c])) {
      avisar.aviso('Este acto no trae acreditado, escritura, fecha, notario ni monto. Puedes seleccionar el texto en el PDF y usarlo en el dato que quieras.');
      return;
    }
    const marcar = (lista) => (lista || []).map((a) => ({ ...a, elegido: a.id === acto.id }));
    const cambios = {};
    CAMPOS_DEL_ACTO.forEach((c) => { if (acto.datos[c]) cambios[c] = acto.datos[c]; });
    // El acreditado y su cónyuge son los de este acto (si el acto trae personas)
    if (acto.datos.nombre_acreditado) {
      cambios.nombre_conyuge = acto.datos.nombre_conyuge || '';
      if (acto.datos.nombre_conyuge) cambios.tiene_conyuge = 'Sí';
    }
    if (cambios.monto_credito) {
      // El monto en letras que se ve en pantalla también se actualiza
      const { extra } = await normalizarCampo('monto_credito', cambios.monto_credito);
      Object.assign(cambios, extra);
    }
    if (destino.origen === 'single') {
      setDatos((prev) => ({ ...prev, ...cambios }));
      setActosSingle(marcar);
    } else {
      const idx = destino.index;
      setBatchResults((prev) => prev.map((item, i) => (i !== idx ? item : {
        ...item,
        actos: marcar(item.actos),
        datos_extraidos: { ...item.datos_extraidos, ...cambios },
      })));
    }
    const tomados = CAMPOS_DEL_ACTO.filter((c) => acto.datos[c]).map(etiquetaDe);
    const faltan = CAMPOS_DEL_ACTO.filter((c) => !acto.datos[c] && !(c === 'nombre_conyuge' && acto.datos.nombre_acreditado)).map(etiquetaDe);
    avisar.exito(`Acto ${acto.clave || ''} (pág. ${acto.pagina}): se tomó ${tomados.join(', ').toLowerCase()}.`
      + (faltan.length ? ` No trae ${faltan.join(', ').toLowerCase()}; se dejó lo que ya tenías.` : ''));
  };

  // Aviso del navegador si se cierra o recarga la página con expedientes sin guardar
  const hayBorradores = pendienteSingle() || batchResults.some((r) => !r.error && !r.expediente_id);
  const hayVersionNueva = useVersionNueva();
  const [versionPospuesta, setVersionPospuesta] = useState(false);
  const actualizarVersion = async () => {
    if (hayBorradores && !(await confirmar('Tienes expedientes leídos sin guardar; si actualizas ahora se pierden.', { titulo: '¿Actualizar el sistema?', textoConfirmar: 'Actualizar de todas formas', peligro: true }))) return;
    window.location.reload();
  };
  useEffect(() => {
    if (!hayBorradores) return;
    const alSalirPagina = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', alSalirPagina);
    return () => window.removeEventListener('beforeunload', alSalirPagina);
  }, [hayBorradores]);

  // ---- PLANTILLA SUGERIDA ----
  const sugerenciaSingle = sugerenciaActual(sugerenciaBase, datos, actosSingle);
  const sugerenciaDeLote = (item) => sugerenciaActual(item?.plantilla_sugerida, item?.datos_extraidos, item?.actos);
  const usarPlantillaSugerida = (plantilla) => {
    setSelectedPlantilla(plantilla);
    avisar.exito(`Plantilla seleccionada: ${nombrePlantilla(plantilla)}`);
  };
  const usarSugeridasEnLote = () => {
    let cambiadas = 0;
    const nuevos = batchResults.map((item) => {
      const sug = sugerenciaDeLote(item);
      if (item.error || !sug?.plantilla || sug.plantilla === item.plantilla_seleccionada) return item;
      cambiadas++;
      return { ...item, plantilla_seleccionada: sug.plantilla };
    });
    setBatchResults(nuevos);
    avisar.exito(cambiadas ? `Se aplicó la plantilla sugerida a ${cambiadas} expediente(s).` : 'Todos los expedientes ya tienen su plantilla sugerida.');
  };

  // Todo lo que las pantallas (components/) necesitan leer del estado de App
  const ctx = {
    guardarSingle,
    conflictoSingle,
    numeroEnNombre,
    avisosSingle,
    guardando,
    guardarLote,
    moverArchivoLote,
    quitarArchivoLote,
    quitarExpedienteLote,
    quitarMarcadosLote,
    sugerenciaSingle,
    sugerenciaDeLote,
    usarPlantillaSugerida,
    usarSugeridasEnLote,
    archivosSingle,
    archivosDeLote,
    nuevoExpedienteSingle,
    filtroEstado,
    setFiltroEstado,
    conteoEstados,
    cambiarEstado,
    iniciarEdicionSingle,
    editarSinDocumentos,
    salirEdicionSingle,
    volverADocumentos,
    edicionSingle,
    cargandoPdfs,
    cambiosEdicion,
    puedeServidor,
    confirmarRepetidos,
    setHistorial,
    carta2Single,
    coacSingle,
    setCoacManual,
    agregarCarta2Single,
    normalizarCampo,
    camposDePlantilla: (plantilla) => camposPorPlantilla[normalizarPlantilla(plantilla)] || null,
    actosSingle,
    asignarCampoDesdeDocumento,
    usarActo,
    formatearMonto,
    abrirVistaPrevia,
    batchPreviewIndex: vistaPrevia?.origen === 'batch' ? vistaPrevia.index : null,
    cerrarVistaPrevia,
    documentoPrevia,
    estadoPrevia,
    refrescarVistaPrevia,
    // Solo se muestra si lo que se pidió ver todavía existe
    vistaPrevia: vistaPrevia && solicitudPrevia ? { ...vistaPrevia, titulo: solicitudPrevia.titulo || vistaPrevia.titulo } : null,
    cambiarLadoPrevia,
    cargandoHistorial,
    creandoUsuario,
    descargandoId,
    descargandoZip,
    setUnlockedFields,
    mensajeFaltantesManual: (faltan) => mensajeFaltantes(faltan, 'generar el expediente'),
    etiquetaCampo,
    faltantesPara,
    handleCambiarActivo,
    setModalPassword,
    activeTab,
    archivoExcel,
    batchFiles,
    batchLoading,
    batchResults,
    cargando,
    contadoresRemosion,
    currentUser,
    datos,
    esAdmin,
    estadoFilas,
    expedienteId,
    expedientes,
    filasPreview,
    filasSeleccionadas,
    filterPeriod,
    filteredHistorial,
    formData,
    formatLabel,
    handleApplyTemplateToSelected,
    cartaSingle,
    constanciaSingle,
    elegirArchivoSingle,
    quitarArchivoSingle,
    soltarArchivoSingle,
    cartasLote,
    constanciasLote,
    agregarArchivosLote,
    quitarArchivoDeLote,
    soltarArchivosLote,
    handleBatchInputChange,
    handleBatchPlantillaChange,
    handleConfirmLogout,
    handleCrearUsuario,
    handleDownloadWord,
    esRevisor,
    puedeCompartir,
    abrirCompartir,
    pdfsDeSoltar,
    setModalCompletarPdfs,
    hayCompartidos,
    verCompartidos,
    plantillaGuardada,
    handleDownloadZip,
    handleDragOver,
    handleEliminarUsuario,
    handleCambiarRol,
    handleExcelSubmit,
    handleExport,
    handleInputChange,
    handleLogin,
    handlePreviewExcel,
    handleSelectAllBatch,
    handleToggleSelectBatch,
    handleToggleUnlock,
    handleUploadBatch,
    handleUploadSingle,
    isDarkMode,
    isLoggingIn,
    loading,
    loadingUsuarios,
    loginError,
    loginPassword,
    loginUser,
    manualPreviewRef,
    mesesNombres,
    nuevoUsuario,
    openAccordion,
    paginaActual,
    parsearFechaExpediente,
    plantillasFilas,
    progreso,
    progressBatch,
    progressSingle,
    searchQuery,
    selectedBatchIndices,
    selectedDay,
    selectedMonth,
    selectedPlantilla,
    selectedYear,
    setActiveTab: cambiarPestana,
    setArchivoExcel,
    setCargando,
    setExpedientes,
    setFilasPreview,
    setFilasSeleccionadas,
    setFilterPeriod,
    setFormData,
    setLoginPassword,
    setLoginUser,
    setNuevoUsuario,
    setPaginaActual,
    setPlantillasFilas,
    setSearchQuery,
    setSelectedDay,
    setSelectedMonth,
    setSelectedPlantilla,
    setSelectedYear,
    setShowExportMenu,
    setShowLogoutModal,
    setSortAscending,
    showExportMenu,
    singleFiles,
    sortAscending,
    textoProgreso,
    theme,
    toggleAccordion,
    toggleTheme,
    temaPreferido,
    cambiarTema,
    colorAcento,
    setColorAcento,
    guardarPreferencias,
    setCurrentUser,
    unlockedFields,
    usuariosLista
  };

  return (
    <AppContext.Provider value={ctx}>
    <div
      className={[
        isDarkMode ? 'tema-oscuro' : 'tema-claro',
        // En lote, captura manual e historial la vista previa reserva su espacio
        // (la lista se acomoda a un lado); en caso individual flota encima de la carga de archivos
        vistaPrevia && solicitudPrevia && vistaPrevia.origen !== 'single' && !vistaPrevia.embebido && !vistaPrevia.flotante ? `con-previa-${vistaPrevia.lado}` : '',
      ].join(' ')}
      style={{
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      backgroundColor: theme.bg,
      color: theme.textPrimary,
      minHeight: '100vh',
      width: '100%',
      maxWidth: '100%',
      margin: 0,
      padding: 0,
      boxSizing: 'border-box',
      transition: 'background-color 0.2s, color 0.2s'
    }}>

      {isCheckingAuth ? (
        <PantallaCarga isDarkMode={isDarkMode} />
      ) : !isAuthenticated ? (
        <LoginScreen />
      ) : (
        <div className={`layout-app ${bienvenida && !bienvenida.saliendo ? 'esperando-entrada' : ''} ${animarEntrada ? 'entrada-sistema' : 'fade-in'}`} style={{ 
          display: 'flex',
          minHeight: '100vh',
          width: '100%',
          backgroundColor: theme.bg
        }}>
          
          {/* Celular y tablet: barra arriba (cuenta) y pestañas abajo; computadora: barra lateral */}
          {esMovil ? <NavegacionMovil /> : <Sidebar />}

          {/* CONTENIDO PRINCIPAL */}
          <main className="contenido-principal" style={{ flex: 1, minWidth: 0, padding: '32px', boxSizing: 'border-box', overflowY: 'auto' }}>
            
            {/* NOTIFICACIÓN DE ERROR */}
            {error && (
              <div className="slide-up" style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', borderLeft: '4px solid #ef4444', color: isDarkMode ? '#fca5a5' : '#991b1b', padding: '14px 18px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            {/* CONTENEDOR DE TARJETA PRINCIPAL: cada pestaña vive en src/components/ */}
            <div className="tarjeta-principal" style={{ backgroundColor: theme.cardBg, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '32px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              {/* key: al cambiar de pestaña se reinicia la animación de entrada */}
              <div key={activeTab} className="cambio-pestana">
              {activeTab === 'single' && <TabIndividual />}
              {activeTab === 'batch' && <TabMasivo />}
              {activeTab === 'manual' && <TabManual />}
              {activeTab === 'excel' && <TabExcel />}
              {activeTab === 'history' && <TabHistorial />}
              {activeTab === 'compartidos' && <TabHistorial />}
              {activeTab === 'users' && esAdmin && <TabUsuarios />}
              {activeTab === 'kpis' && esAdmin && <TabKpis />}
              {activeTab === 'perfil' && <TabPerfil />}
              </div>
            </div>

          </main>
        </div>
      )}

      {/* MODAL DE CIERRE DE SESIÓN */}
      {showLogoutModal && <LogoutModal />}
      {modalCompartir && (
        <ModalCompartir {...modalCompartir} onCerrar={() => setModalCompartir(null)}
          onListo={() => { modalCompartir.onListo?.(); if (activeTab === 'history') cargarHistorialUsuario('history'); }} />
      )}
      {modalCompletarPdfs && <ModalCompletarPdfs onCerrar={() => setModalCompletarPdfs(false)} />}

      {/* PRESENTACIÓN DESPUÉS DE INICIAR SESIÓN */}
      {isAuthenticated && bienvenida && (
        <PantallaCarga isDarkMode={isDarkMode} nombre={bienvenida.nombre} genero={bienvenida.genero} saliendo={bienvenida.saliendo} />
      )}

      {/* VISTA PREVIA FLOTANTE */}
      {isAuthenticated && <PanelVistaPrevia />}

      {/* AVISOS FLOTANTES Y CONFIRMACIONES */}
      <Notificaciones />
      {isAuthenticated && avisoInactividad !== null && (
        <AvisoInactividad segundos={avisoInactividad} onSeguir={() => { seguirTrabajando(); setAvisoInactividad(null); }} theme={theme} />
      )}
      {hayVersionNueva && !versionPospuesta && (
        <AvisoVersionNueva onActualizar={actualizarVersion} onDespues={() => setVersionPospuesta(true)} theme={theme} />
      )}
      {!isAuthenticated && avisoSesion && (
        <AvisoSesionCerrada motivo={avisoSesion.motivo} segundos={avisoSesion.segundos} onAceptar={() => setAvisoSesion(null)} theme={theme} isDarkMode={isDarkMode} />
      )}

      {/* CONTRASEÑA TEMPORAL: el administrador la restableció y hay que cambiarla antes de trabajar */}
      {isAuthenticated && currentUser?.debe_cambiar_password && !modalPassword && (
        <ModalPassword
          titulo="Crea tu contraseña"
          descripcion="Entraste con una contraseña temporal que te dio el administrador. Por seguridad, cámbiala ahora por una que solo tú conozcas."
          etiquetaActual="Contraseña temporal"
          textoCancelar="Cerrar sesión"
          onCancelar={handleConfirmLogout}
          onGuardar={async (actual, nueva) => {
            await api.post('/auth/cambiar-password', { password_actual: actual, password_nueva: nueva });
            setCurrentUser((u) => (u ? { ...u, debe_cambiar_password: false } : u));
            avisar.exito('Listo: tu contraseña nueva quedó guardada.');
          }}
        />
      )}

      {/* VENTANA DE CONTRASEÑA */}
      {modalPassword && modalPassword.modo === 'restablecer' && (
        <ModalPassword
          titulo={`Restablecer contraseña de ${modalPassword.usuario.nombre_mostrar || modalPassword.usuario.username}`}
          descripcion="Para cuando olvidó su contraseña. Confirma con TU contraseña de administrador y asígnale una temporal: al entrar con ella, el sistema le pedirá cambiarla. Sus sesiones abiertas se cerrarán."
          etiquetaActual="Tu contraseña de administrador"
          etiquetaNueva={`Contraseña temporal para ${modalPassword.usuario.username}`}
          generar
          onCancelar={() => setModalPassword(null)}
          onGuardar={handleGuardarPassword}
        />
      )}
      {modalPassword && modalPassword.modo !== 'restablecer' && (
        <ModalPassword
          titulo={modalPassword.modo === 'reset' ? `Nueva contraseña para ${modalPassword.usuario.username}` : 'Cambiar mi contraseña'}
          descripcion={modalPassword.modo === 'reset'
            ? 'Escribe la contraseña actual de este usuario y la nueva. Deberá entrar con la nueva contraseña y sus sesiones abiertas se cerrarán.'
            : 'Por seguridad, se cerrará tu sesión en otras computadoras.'}
          etiquetaActual={modalPassword.modo === 'reset' ? `Contraseña actual de ${modalPassword.usuario.username}` : 'Contraseña actual'}
          onCancelar={() => setModalPassword(null)}
          onGuardar={handleGuardarPassword}
        />
      )}
    </div>
    </AppContext.Provider>
  );
}
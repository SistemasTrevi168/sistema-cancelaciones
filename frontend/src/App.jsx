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
import { CAMPOS_DEL_ACTO, etiquetaDe } from './camposExpediente';
import { sugerenciaActual } from './sugerenciaPlantilla';
import { nombrePlantilla } from './plantillasCatalogo';
import { camposFaltantes, etiquetaCampo, mensajeFaltantes, normalizarPlantilla } from './datosFaltantes';
import Sidebar from './components/Sidebar';
import TabExcel from './components/TabExcel';
import TabHistorial from './components/TabHistorial';
import TabIndividual from './components/TabIndividual';
import TabManual from './components/TabManual';
import TabMasivo from './components/TabMasivo';
import TabUsuarios from './components/TabUsuarios';
import TabKpis from './components/TabKpis';
import TabPerfil from './components/TabPerfil';
import NavegacionMovil from './components/NavegacionMovil';
import useCelular from './usarCelular';
import { COLOR_ACENTO_DEFECTO, colorLegible } from './colores';
import { renderAsync } from 'docx-preview';
import { AlertCircle } from 'lucide-react';

// Estado de los botones atrás/adelante del navegador (fuera de React: solo lo usan los eventos del navegador)
const navegador = { guardia: false, auth: false, tab: 'single', alSalir: null, alVolverPestana: null, alRevisar: null };


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
    };
  });
  const COLUMNAS_REPORTE = [
    ['numero', '#'], ['propietario', 'Propietario'], ['acreditado', 'Acreditado'], ['credito', 'No. Crédito'],
    ['monto', 'Monto'], ['fecha', 'Fecha'], ['hora', 'Hora'],
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
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:16pt;color:#1e3a8a}table{border-collapse:collapse;width:100%}th{background:#1e3a8a;color:#fff;padding:6px;text-align:left}td{border-bottom:1px solid #cbd5e1;padding:5px}</style></head>
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
  const singleFiles = [cartaSingle, constanciaSingle].filter(Boolean);
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
      if (activeTab === 'history') cargarHistorialUsuario();
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
    alExpirarSesion(() => {
      if (!navegador.auth) return;
      navegador.auth = false;
      avisar.aviso('Tu sesión expiró o se cerró. Vuelve a ingresar.');
      navegador.alSalir?.();
    });
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
        setCurrentUser(res.data.user);
        aplicarPreferenciasDe(res.data.user);
        setIsAuthenticated(true);
        navegador.auth = true;
        crearGuardiaHistorial();
        // Presentación de bienvenida (se va sola)
        setBienvenida({ nombre: (res.data.user?.nombre_mostrar || res.data.user?.username || '').split(' ')[0], saliendo: false });
        setTimeout(() => {
          setBienvenida((b) => (b ? { ...b, saliendo: true } : b));
          setAnimarEntrada(true); // el sistema entra mientras se desvanece la bienvenida
        }, 1700);
        setTimeout(() => setBienvenida(null), 2100);
        setTimeout(() => setAnimarEntrada(false), 3000);
        setLoginPassword('');
        setCartaSingle(null); setConstanciaSingle(null);
        setDatos(null); setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]);
        setBatchResults([]);
      }
    } catch (err) {
      setLoginError(err.response?.data?.detail || 'Error al iniciar sesión.');
    } finally {
      setIsLoggingIn(false);
    }
  };

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
      setHistorial([]);

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

  const cargarHistorialUsuario = async () => {
    setCargandoHistorial(true);
    try {
      const res = await api.get('/expedientes', {
        params: { usuario: currentUser.username }
      });
      setHistorial(res.data || []);
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
      formDataObj.append('es_admin', nuevoUsuario.es_admin);

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

    if (!(await confirmar('Se eliminará este usuario. Esta acción no se puede deshacer.', { titulo: 'Eliminar usuario', textoConfirmar: 'Sí, eliminar', peligro: true }))) {
      return;
    }

    try {
      await api.delete(`/admin/usuarios/${usuarioId}`);
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
    if (modalPassword?.modo === 'reset') {
      await api.post(`/admin/usuarios/${modalPassword.usuario.id}/password`, { password_nueva: nueva });
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
  const tipoDeArchivo = (f) => (f === cartaSingle || cartasLote.includes(f) ? 'carta' : 'constancia');

  // ---- Caso individual ----
  const elegirArchivoSingle = (tipo, archivos) => {
    const pdf = Array.from(archivos || []).find((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdf) { avisar.aviso('Elige un archivo PDF.'); return; }
    if (tipo === 'carta') setCartaSingle(pdf); else setConstanciaSingle(pdf);
    setDatos(null); setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]); setError('');
  };
  const quitarArchivoSingle = (tipo) => {
    if (tipo === 'carta') setCartaSingle(null); else setConstanciaSingle(null);
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
    fijar((prev) => {
      const ya = new Set(prev.map((f) => `${f.name}|${f.size}`));
      return [...prev, ...pdfs.filter((f) => !ya.has(`${f.name}|${f.size}`))];
    });
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
    const nk = numeroEnNombre(constanciaSingle?.name);
    return nc && nk && nc !== nk ? { carta: nc, constancia: nk } : null;
  })();

  const handleUploadSingle = async () => {
    if (singleFiles.length === 0) return;
    if (conflictoSingle) {
      avisar.error(`Los archivos no son del mismo crédito (${conflictoSingle.carta} y ${conflictoSingle.constancia}).`);
      return;
    }
    cerrarVistaPrevia();
   
    setLoading(true);
    setProgressSingle(10);
    setError('');

    const interval = setInterval(() => {
      setProgressSingle((prev) => (prev < 90 ? prev + 15 : prev));
    }, 200);

    // Solo se LEEN los datos (no se guarda nada): primero se revisan y después se guardan
    const formDataObj = new FormData();
    singleFiles.forEach((f) => { formDataObj.append('files', f); formDataObj.append('tipos', tipoDeArchivo(f)); });
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
        setDatos({ numero_credito: rawDatos.numero_credito || '', ...rawDatos });
        setActosSingle(borrador.actos || []);
        setSugerenciaBase(borrador.plantilla_sugerida || null);
        setAvisosSingle(borrador.avisos || []);
        setLecturaSingle({ datos: { ...rawDatos }, leido_en: borrador.leido_en || null });
        setUnlockedFields({});
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
  const metricasDe = (origen, lectura, actual, avisos) => ({
    origen,
    leido_en: lectura?.leido_en || null,
    corregidos: camposCorregidos(lectura?.datos, actual),
    avisos: (avisos || []).length,
  });

  const guardarSingle = async () => {
    if (!datos) return;
    const faltan = faltantesPara(datos, selectedPlantilla);
    if (faltan.length > 0 && !(await confirmar(mensajeFaltantes(faltan, 'guardar el expediente'), { titulo: 'Faltan datos', textoConfirmar: 'Guardar de todas formas' }))) return;
    setGuardando((g) => ({ ...g, single: true }));
    try {
      const [r] = await guardarEnBase([{ ref: 'single', datos, plantilla: selectedPlantilla, archivos: singleFiles.map((f) => f.name), metricas: metricasDe('individual', lecturaSingle, datos, avisosSingle) }]);
      if (!r || r.error) throw new Error(r?.error || 'No se pudo guardar');
      setExpedienteId(r.expediente_id);
      avisar.exito('Expediente guardado y procesado. Ya está en Mi Historial.');
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
    setDatos((prev) => ({ ...prev, [field]: value }));
  };

  const handleBatchInputChange = (index, field, value) => {
    setBatchResults((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        datos_extraidos: {
          ...updated[index].datos_extraidos,
          [field]: value
        }
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

  // Guarda en la base los expedientes indicados (por índice); regresa { ref: expediente_id } de los guardados
  const guardarLote = async (indices) => {
    const items = indices.map((i) => ({ i, r: batchResults[i] })).filter(({ r }) => r && !r.error && !r.expediente_id && !r.leyendo);
    if (items.length === 0) return {};
    const conFaltantes = items.filter(({ r }) => faltantesPara(r.datos_extraidos, r.plantilla_seleccionada || selectedPlantilla).length > 0);
    if (conFaltantes.length > 0 && !(await confirmar(
      `${conFaltantes.length} de ${items.length} expediente(s) tienen datos faltantes (marcados con ⚠).\n\n¿Quieres guardarlos de todas formas?`,
      { titulo: 'Expedientes incompletos', textoConfirmar: 'Guardar de todas formas' }
    ))) return {};
    const refs = Object.fromEntries(items.map(({ r }) => [r.ref, true]));
    setGuardando((g) => ({ ...g, ...refs }));
    const nuevosIds = {};
    try {
      const resultados = await guardarEnBase(items.map(({ r }) => ({
        ref: r.ref, datos: r.datos_extraidos, plantilla: r.plantilla_seleccionada || selectedPlantilla, archivos: r.archivos,
        metricas: metricasDe('masivo', r.lectura, r.datos_extraidos, r.avisos),
      })));
      const porRef = Object.fromEntries(resultados.map((x) => [x.ref, x]));
      const guardados = resultados.filter((x) => !x.error).length;
      resultados.forEach((x) => { if (!x.error) nuevosIds[x.ref] = x.expediente_id; });
      setBatchResults((prev) => prev.map((r) => {
        const x = porRef[r.ref];
        return x && !x.error ? { ...r, expediente_id: x.expediente_id } : r;
      }));
      const errores = resultados.filter((x) => x.error);
      if (errores.length) avisar.error(`${errores.length} expediente(s) no se pudieron guardar: ${errores[0].error}`);
      if (guardados) avisar.exito(`${guardados} expediente(s) guardados y procesados. Ya están en Mi Historial.`);
    } catch (err) {
      avisar.error(`No se pudo guardar: ${err.response?.data?.detail || err.message}`);
    } finally {
      setGuardando((g) => Object.fromEntries(Object.entries(g).filter(([k]) => !refs[k])));
    }
    return nuevosIds;
  };

// 📥 Función de descarga con el nombre basado en el Número de Crédito
const handleDownloadWord = async (expedienteId, datosParam = null, plantillaParam = null) => {
  try {
    const idReal = expedienteId;
    if (!idReal) {
      avisar.error("Error: No se encontró un ID de expediente válido para la descarga.");
      return;
    }

    // Aviso si faltan datos que la plantilla necesita
    // Cada expediente usa su propia plantilla (lote/historial); si no trae, la seleccionada
    const plantillaUsar = plantillaParam || selectedPlantilla;
    const faltan = faltantesPara(datosParam || datos, plantillaUsar);
    if (faltan.length > 0 && !(await confirmar(mensajeFaltantes(faltan), { titulo: 'Faltan datos', textoConfirmar: 'Generar de todas formas' }))) return;

    setDescargandoId(idReal);
    const response = await api.post(
      `/expedientes/${idReal}/generar-word`,
      {
        plantilla: plantillaUsar,
        datos: datosParam || datos 
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
const filteredHistorial = (historial || []).filter((item) => {
  const parsed = parsearFechaExpediente(item);

  // Filtro por Búsqueda de Texto (Acreditado o Crédito)
  if (searchQuery && searchQuery.trim() !== '') {
    const q = searchQuery.toLowerCase();
    const dExtra = item.datos_extraidos || {};
    const nombre = (dExtra.acreditado || dExtra.nombre_acreditado || item.nombre_acreditado || '').toLowerCase();
    const numCred = (dExtra.numero_credito || item.numero_credito || '').toString().toLowerCase();
    
    if (!nombre.includes(q) && !numCred.includes(q)) {
      return false;
    }
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

  // Empieza un expediente nuevo en Caso Individual
  const nuevoExpedienteSingle = async () => {
    if (datos && !expedienteId && !(await confirmar('Este expediente todavía no está guardado; si continúas se pierden los datos leídos y lo que hayas corregido.', { titulo: '¿Descartar el expediente?', textoConfirmar: 'Descartar', peligro: true }))) return;
    cerrarVistaPrevia();
    setDatos(null); setActosSingle([]); setSugerenciaBase(null); setAvisosSingle([]);
    setCartaSingle(null); setConstanciaSingle(null); setExpedienteId(''); setError(''); setProgressSingle(0);
    setUnlockedFields({});
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
  const hayBorradores = (!!datos && !expedienteId) || batchResults.some((r) => !r.error && !r.expediente_id);
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
    sugerenciaSingle,
    sugerenciaDeLote,
    usarPlantillaSugerida,
    usarSugeridasEnLote,
    archivosSingle,
    archivosDeLote,
    nuevoExpedienteSingle,
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
    handleDownloadZip,
    handleDragOver,
    handleEliminarUsuario,
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

      {/* PRESENTACIÓN DESPUÉS DE INICIAR SESIÓN */}
      {isAuthenticated && bienvenida && (
        <PantallaCarga isDarkMode={isDarkMode} nombre={bienvenida.nombre} saliendo={bienvenida.saliendo} />
      )}

      {/* VISTA PREVIA FLOTANTE */}
      {isAuthenticated && <PanelVistaPrevia />}

      {/* AVISOS FLOTANTES Y CONFIRMACIONES */}
      <Notificaciones />

      {/* VENTANA DE CONTRASEÑA */}
      {modalPassword && (
        <ModalPassword
          titulo={modalPassword.modo === 'reset' ? `Nueva contraseña para ${modalPassword.usuario.username}` : 'Cambiar mi contraseña'}
          descripcion={modalPassword.modo === 'reset'
            ? 'El usuario deberá entrar con esta contraseña. Sus sesiones abiertas se cerrarán.'
            : 'Por seguridad, se cerrará tu sesión en otras computadoras.'}
          pedirActual={modalPassword.modo !== 'reset'}
          onCancelar={() => setModalPassword(null)}
          onGuardar={handleGuardarPassword}
        />
      )}
    </div>
    </AppContext.Provider>
  );
}
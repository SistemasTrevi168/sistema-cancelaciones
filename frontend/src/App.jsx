import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api, API_BASE } from './api';
import { AppContext } from './AppContext';
import LoginScreen from './components/LoginScreen';
import LogoutModal from './components/LogoutModal';
import ModalPassword from './components/ModalPassword';
import Notificaciones from './components/Notificaciones';
import { avisar, confirmar } from './ui/notificaciones';
import { etiquetaDe } from './camposExpediente';
import { camposFaltantes, etiquetaCampo, mensajeFaltantes, normalizarPlantilla } from './datosFaltantes';
import Sidebar from './components/Sidebar';
import TabExcel from './components/TabExcel';
import TabHistorial from './components/TabHistorial';
import TabIndividual from './components/TabIndividual';
import TabManual from './components/TabManual';
import TabMasivo from './components/TabMasivo';
import TabUsuarios from './components/TabUsuarios';
import { renderAsync } from 'docx-preview';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function App() {
  // --- TEMA (CLARO / OSCURO) ---
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // ESTADO PARA EL MENÚ DESPLEGABLE DE EXPORTACIÓN
  const [showExportMenu, setShowExportMenu] = React.useState(false);

  // Estado para la plantilla seleccionada (por defecto la primera de CDMX)
const [selectedPlantilla, setSelectedPlantilla] = React.useState('CDMX_AP_H_SOLTERO');

  // FUNCIÓN MULTI-FORMATO DE EXPORTACIÓN
  const handleExport = async (format) => {
    setShowExportMenu(false);

    if (filteredHistorial.length === 0) {
      avisar.aviso("No hay datos para exportar.");
      return;
    }

    const now = new Date();
    const fechaEmision = now.toLocaleDateString('es-MX') + ' ' + now.toLocaleTimeString('es-MX');

    // 1. EXPORTAR A CSV / EXCEL
    if (format === 'csv') {
      try {
 let csvLines = [];
        csvLines.push("\uFEFFREPORTE DE HISTORIAL DE EXPEDIENTES");
        csvLines.push(`Fecha de Emisión:,${fechaEmision}`);
        csvLines.push(`Total de Registros:,${filteredHistorial.length}`);
        csvLines.push("");
        
        // 1. CABECERA: 5 columnas exactas
        csvLines.push("#,Propietario,Acreditado,No. Credito,Fecha");

        // 2. FILAS: 5 valores exactos correspondientes
        filteredHistorial.forEach((item, index) => {
          const dExtra = item.datos_extraidos || {};
          
          const prop = item.usuario_propietario || item.usuario || 'N/A';

          const nom = 
            dExtra.acreditado || 
            dExtra.nombre_acreditado || 
            dExtra.nombre || 
            dExtra.titular || 
            item.nombre_acreditado || 
            'N/A';

          const num = dExtra.numero_credito || item.numero_credito || 'N/A';
          const p = parsearFechaExpediente(item);
          const fec = p ? p.fechaTexto : (item.created_at || item.fecha || 'N/A');

          // Formato idéntico a las cabeceras
          csvLines.push(`${index + 1},"${prop}","${nom.replace(/"/g, '""')}","${num}","${fec}"`);
        });

        const csvContent = csvLines.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Reporte_Expedientes_${now.toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        avisar.error("Error al generar CSV: " + err.message);
      }
    }

    // 2. EXPORTAR A IMAGEN (PNG)
    if (format === 'image') {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const element = document.getElementById('tabla-historial-export');
        if (!element) {
          avisar.error("No se encontró la tabla para captura.");
          return;
        }
        const canvas = await html2canvas(element, { scale: 2 });
        const link = document.createElement('a');
        link.download = `Reporte_Expedientes_${now.toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (err) {
        avisar.error("Para exportar a imagen, instala html2canvas con: npm install html2canvas");
      }
    }

    // 3. IMPRIMIR / PDF
    if (format === 'print') {
      window.print();
    }
  };

 // --- 1. ESTADOS DE TEMA Y SESIÓN ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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

  // --- 4. REFS Y VISTAS PREVIAS ---
  const previewContainerRef = useRef(null);
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);
  const [cargandoPreview, setCargandoPreview] = useState(false);

  const [batchPreviewIndex, setBatchPreviewIndex] = useState(null);
  const batchPreviewRef = useRef(null);

  const [manualPreviewActive, setManualPreviewActive] = useState(false);
  const [cargandoManualPreview, setCargandoManualPreview] = useState(false);
  const manualPreviewRef = useRef(null);

  // --- 5. MAPA DE DESBLOQUEO ---
  const [unlockedFields, setUnlockedFields] = useState({});

  // --- 6. ESTADOS - Caso Individual ---
  const [singleFiles, setSingleFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progressSingle, setProgressSingle] = useState(0);
  const [expedienteId, setExpedienteId] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  // --- 7. ESTADOS - Carga Masiva ---
  const [batchFiles, setBatchFiles] = useState([]);
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
    notario_origen_completo: ''
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

  // Validar sesión activa al recargar la página (F5), una sola vez
  useEffect(() => {
    verificarSesion();
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

  // Actualización en tiempo real con debounce al editar datos individuales
  useEffect(() => {
    if (!mostrarVistaPrevia || !datos || !expedienteId) return;
    const timer = setTimeout(() => {
      actualizarVistaPreviaTiempoReal();
    }, 0);
    return () => clearTimeout(timer);
  }, [datos, mostrarVistaPrevia]);

  // Hook para actualización en tiempo real cuando se modifican los datos del lote
  useEffect(() => {
    if (batchPreviewIndex === null || !batchResults[batchPreviewIndex]) return;
    const timer = setTimeout(() => {
      actualizarVistaPreviaMasivaTiempoReal(batchPreviewIndex);
    }, 0);
    return () => clearTimeout(timer);
  }, [batchResults, batchPreviewIndex]);

  // Neutralizar navegación por historial del navegador
  useEffect(() => {
    if (isAuthenticated) {
      window.history.replaceState(null, "", window.location.href);
      window.history.pushState(null, "", window.location.href);

      const handlePopState = (e) => {
        window.history.pushState(null, "", window.location.href);
      };

      window.addEventListener("popstate", handlePopState);
      return () => {
        window.removeEventListener("popstate", handlePopState);
      };
    }
  }, [isAuthenticated]);



  // ==========================================
  // --- FUNCIONES Y MANEJADORES ---
  // ==========================================

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const verificarSesion = async () => {
    try {
      // /auth/sesion responde 200 aunque no haya sesión, así la consola no muestra errores
      const res = await api.get('/auth/sesion');
      if (res.data?.autenticado && res.data?.user) {
        setCurrentUser(res.data.user);
        setIsAuthenticated(true);
      } else {
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
        setCurrentUser(res.data.user);
        setIsAuthenticated(true);
        window.history.replaceState(null, "", window.location.href);
        setLoginPassword('');
        setSingleFiles([]);
        setDatos(null);
        setBatchResults([]);
      }
    } catch (err) {
      setLoginError(err.response?.data?.detail || 'Error al iniciar sesión.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConfirmLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setShowLogoutModal(false);
      setLoginUser('');
      setLoginPassword('');
      setDatos(null);
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

  const handleGenerarVistaPrevia = async () => {
  if (!expedienteId || !datos) return; // 👈 Evita peticiones vacías
  
  setCargandoPreview(true);
  setMostrarVistaPrevia(true);

  try {
    const response = await api.post(
      `/expedientes/${expedienteId}/generar-word`, 
      {
        plantilla: selectedPlantilla,
        datos: datos
      },
      { responseType: 'arraybuffer' }
    );

    const contentType = response.headers?.['content-type'] || '';
    if (contentType.includes('application/json') || contentType.includes('text/html') || response.data.byteLength < 500) {
      console.error("El servidor no pudo generar el Word correctamente.");
      setCargandoPreview(false);
      return;
    }

    const arrayBuffer = response.data;
    setCargandoPreview(false);

    setTimeout(async () => {
      if (previewContainerRef.current) {
        previewContainerRef.current.innerHTML = ""; 
        await renderAsync(arrayBuffer, previewContainerRef.current);
      }
    }, 50);

  } catch (error) {
    console.error("Error al renderizar vista previa:", error);
    setCargandoPreview(false);
  }
};

const actualizarVistaPreviaTiempoReal = async () => {
  if (!expedienteId) return; // 👈 Candado vital para evitar el error 404
  try {
    const response = await api.post(
      `/expedientes/${expedienteId}/generar-word`,
      {
        plantilla: selectedPlantilla,
        datos: datos
      },
      { responseType: 'arraybuffer' }
    );

    const contentType = response.headers?.['content-type'] || '';
    if (contentType.includes('application/json') || contentType.includes('text/html') || response.data.byteLength < 500) {
      return;
    }

    if (previewContainerRef.current) {
      const tempContainer = document.createElement('div');
      tempContainer.className = "docx-container-scroll";

      await renderAsync(response.data, tempContainer);
      previewContainerRef.current.innerHTML = tempContainer.innerHTML;
    }
  } catch (error) {
    console.error("Error al actualizar la vista previa en tiempo real:", error);
  }
};

const actualizarVistaPreviaMasivaTiempoReal = async (index) => {
  try {
    const item = batchResults[index];
    if (!item || !item.expediente_id) return; // 👈 Candado para la carga masiva

    const response = await api.post(
      `/expedientes/${item.expediente_id}/generar-word`,
      {
        plantilla: item.plantilla_seleccionada || selectedPlantilla, 
        datos: item.datos_extraidos
      },
      { responseType: 'arraybuffer' }
    );

    const contentType = response.headers?.['content-type'] || '';
    if (contentType.includes('application/json') || contentType.includes('text/html') || response.data.byteLength < 500) {
      return;
    }

    if (batchPreviewRef.current) {
      const tempContainer = document.createElement('div');
      tempContainer.className = "docx-container-scroll";

      await renderAsync(response.data, tempContainer);
      batchPreviewRef.current.innerHTML = tempContainer.innerHTML;
    }
  } catch (error) {
    console.error("Error al actualizar la vista previa masiva:", error);
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

  const handleDropSingle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      if (files.length > 0) {
        setSingleFiles(files);
        setDatos(null);
      }
    }
  };

  const handleDropBatch = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    let allPdfFiles = [];
    const items = e.dataTransfer.items;

    if (items && items.length > 0) {
      const promises = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        if (entry) promises.push(scanFilesFromEntry(entry));
      }
      if (promises.length > 0) {
        const results = await Promise.all(promises);
        allPdfFiles = results.flat();
      }
    }

    if (allPdfFiles.length === 0 && e.dataTransfer.files) {
      allPdfFiles = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    }

    if (allPdfFiles.length > 0) {
      setBatchFiles(allPdfFiles);
      setBatchResults([]);
      setError('');
    } else {
      setError('No se encontraron archivos PDF.');
    }
  };

  const handleSingleFileChange = (e) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      if (filesArray.length > 2) {
        avisar.aviso("⚠️ Solo se permite un máximo de 2 archivos para el trámite individual.");
        e.target.value = "";
        return;
      }
      setSingleFiles(filesArray);
      setDatos(null);
    }
  };

  const handleBatchFileChange = (e) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      setBatchFiles(selectedFiles);
      setBatchResults([]);
    }
  };

  const handleUploadSingle = async () => {
    if (singleFiles.length === 0) return;
    setLoading(true);
    setProgressSingle(10);
    setError('');

    const interval = setInterval(() => {
      setProgressSingle((prev) => (prev < 90 ? prev + 15 : prev));
    }, 200);

    const formDataObj = new FormData();
    singleFiles.forEach((f) => formDataObj.append('files', f));
    formDataObj.append('usuario_propietario', currentUser.username);
    formDataObj.append('plantilla', selectedPlantilla);

    try {
      const res = await api.post('/expedientes/procesar', formDataObj);
      clearInterval(interval);
      setProgressSingle(100);
      setTimeout(() => {
        setExpedienteId(res.data.expediente_id || res.data.id || null);
        const rawDatos = res.data.datos_extraidos || {};
        // Antes se agregaban copias "acreditado" y "monto"; al editarlas no cambiaba el Word
        setDatos({
          numero_credito: rawDatos.numero_credito || '',
          ...rawDatos
        });
        setUnlockedFields({});
        setLoading(false);
      }, 400);
    } catch (err) {
      clearInterval(interval);
      setError(err.response?.data?.detail || 'Error al procesar los archivos.');
      setLoading(false);
    }
  };

const handleApplyTemplateToSelected = async (plantillaElegida) => {
  if (!plantillaElegida || selectedBatchIndices.length === 0) return;

  // 1. Actualizamos el estado local de golpe
  let expedientesActualizados = [];
  setBatchResults(prev => {
    expedientesActualizados = prev.map((item, idx) => {
      if (selectedBatchIndices.includes(idx)) {
        return {
          ...item,
          plantilla_seleccionada: plantillaElegida
        };
      }
      return item;
    });
    return expedientesActualizados;
  });

  // 2. Actualizamos la vista previa de los seleccionados enviando la plantilla explícitamente
  for (const index of selectedBatchIndices) {
    if (expedientesActualizados[index]) {
      await actualizarVistaPreviaMasivaTiempoReal(index, plantillaElegida);
    }
  }

  setSelectedBatchIndices([]);
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

    if (batchPreviewIndex === index) {
      actualizarVistaPreviaMasivaTiempoReal(index);
    }
  };

  const handleUploadBatch = async () => {
    if (batchFiles.length === 0) return;
    setBatchLoading(true);
    setProgressBatch(5);
    setError('');

    const chunkSize = 15;
    const totalFiles = batchFiles.length;
    let processedFiles = 0;
    let resultadosTotales = [];

    try {
      for (let i = 0; i < totalFiles; i += chunkSize) {
        const chunk = batchFiles.slice(i, i + chunkSize);
        const formDataObj = new FormData();
        
        chunk.forEach((f) => formDataObj.append('files', f));
        formDataObj.append('usuario_propietario', currentUser.username);
        formDataObj.append('plantilla', selectedPlantilla);

        const res = await api.post('/expedientes/procesar-masivo', formDataObj);

        const detallesNormalizados = (res.data.detalles || []).map((item) => {
          const raw = item.datos_extraidos || {};
          return {
            ...item,
            plantilla_seleccionada: selectedPlantilla,
            datos_extraidos: {
              numero_credito: raw.numero_credito || '',
              ...raw
            }
          };
        });

        resultadosTotales = [...resultadosTotales, ...detallesNormalizados];
        setBatchResults(resultadosTotales);

        processedFiles += chunk.length;
        const porcentajeReal = Math.round((processedFiles / totalFiles) * 95);
        setProgressBatch(porcentajeReal);
      }

      setProgressBatch(100);
      setTimeout(() => {
        if (resultadosTotales.length > 0) {
          setOpenAccordion({ 0: true });
        }
        setUnlockedFields({});
        setBatchLoading(false);
      }, 300);

    } catch (err) {
      setError(err.response?.data?.detail || 'Error al procesar el lote de archivos.');
      setBatchLoading(false);
    }
  };

// 📥 Función de descarga con el nombre basado en el Número de Crédito
const handleDownloadWord = async (expedienteId, datosParam = null) => {
  try {
    const idReal = expedienteId;
    if (!idReal) {
      avisar.error("Error: No se encontró un ID de expediente válido para la descarga.");
      return;
    }

    // Aviso si faltan datos que la plantilla necesita
    const faltan = faltantesPara(datosParam || datos, selectedPlantilla);
    if (faltan.length > 0 && !(await confirmar(mensajeFaltantes(faltan), { titulo: 'Faltan datos', textoConfirmar: 'Generar de todas formas' }))) return;

    setDescargandoId(idReal);
    const response = await api.post(
      `/expedientes/${idReal}/generar-word`,
      {
        plantilla: selectedPlantilla,
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
        headers: {
          'Content-Type': 'application/json',
        },
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
    const conFaltantes = batchResults.filter((r) => !r.error && faltantesPara(
      r.datos_extraidos,
      r.plantilla_seleccionada || r.datos_extraidos?.plantilla_seleccionada || selectedPlantilla
    ).length > 0);
    if (conFaltantes.length > 0 && !await confirmar(
      `${conFaltantes.length} de ${batchResults.length} expediente(s) tienen datos faltantes (están marcados con ⚠ en la lista).\n\n¿Quieres descargar el ZIP de todas formas?`
    , { titulo: 'Expedientes incompletos', textoConfirmar: 'Descargar de todas formas' })) return;

    const ids = batchResults.map((r) => r.expediente_id);
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
  const rawDate = item.created_at || item.createdAt || item.fecha || item.fecha_creacion;
  if (!rawDate) return null;

  let year = null, month = null, day = null, horaStr = '00:00';

  // Caso 1: String en formato "DD-MM-YYYY" o "DD/MM/YYYY" (ej. "15-09-2026")
  if (typeof rawDate === 'string' && (rawDate.includes('-') || rawDate.includes('/'))) {
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
      horaStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
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
    bg: isDarkMode ? '#0b0f19' : '#f8fafc',
    cardBg: isDarkMode ? '#111827' : '#ffffff',
    textPrimary: isDarkMode ? '#f9fafb' : '#0f172a',
    textSecondary: isDarkMode ? '#9ca3af' : '#64748b',
    border: isDarkMode ? '#1f2937' : '#e2e8f0',
    inputBg: isDarkMode ? '#1f2937' : '#ffffff',
    subtleBg: isDarkMode ? '#1f2937' : '#f1f5f9',
    dropzoneBg: isDarkMode ? '#131c2e' : '#f8fafc',
    dropzoneBorder: isDarkMode ? '#3b82f6' : '#93c5fd',
    accent: '#2563eb'
  };

  // Todo lo que las pantallas (components/) necesitan leer del estado de App
  const ctx = {
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
    actualizarVistaPreviaMasivaTiempoReal,
    archivoExcel,
    batchFiles,
    batchLoading,
    batchPreviewIndex,
    batchPreviewRef,
    batchResults,
    cargando,
    cargandoPreview,
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
    handleBatchFileChange,
    handleBatchInputChange,
    handleBatchPlantillaChange,
    handleConfirmLogout,
    handleCrearUsuario,
    handleDownloadWord,
    handleDownloadZip,
    handleDragOver,
    handleDropBatch,
    handleDropSingle,
    handleEliminarUsuario,
    handleExcelSubmit,
    handleExport,
    handleGenerarVistaPrevia,
    handleInputChange,
    handleLogin,
    handlePreviewExcel,
    handleSelectAllBatch,
    handleSingleFileChange,
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
    mostrarVistaPrevia,
    nuevoUsuario,
    openAccordion,
    paginaActual,
    parsearFechaExpediente,
    plantillasFilas,
    previewContainerRef,
    progreso,
    progressBatch,
    progressSingle,
    searchQuery,
    selectedBatchIndices,
    selectedDay,
    selectedMonth,
    selectedPlantilla,
    selectedYear,
    setActiveTab,
    setArchivoExcel,
    setBatchPreviewIndex,
    setCargando,
    setExpedientes,
    setFilasPreview,
    setFilasSeleccionadas,
    setFilterPeriod,
    setFormData,
    setLoginPassword,
    setLoginUser,
    setMostrarVistaPrevia,
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
    unlockedFields,
    usuariosLista
  };

  return (
    <AppContext.Provider value={ctx}>
    <div className={isDarkMode ? 'tema-oscuro' : 'tema-claro'} style={{
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
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
          <div style={{ textAlign: 'center' }}>
            <Loader2 size={48} color={theme.accent} style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      ) : !isAuthenticated ? (
        <LoginScreen />
      ) : (
        <div className="fade-in layout-app" style={{ 
          display: 'flex',
          minHeight: '100vh',
          width: '100%',
          backgroundColor: theme.bg
        }}>
          
          {/* BARRA LATERAL (SIDEBAR) - DISEÑO HÍBRIDO */}
          <Sidebar />

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
              </div>
            </div>

          </main>
        </div>
      )}

      {/* MODAL DE CIERRE DE SESIÓN */}
      {showLogoutModal && <LogoutModal />}

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
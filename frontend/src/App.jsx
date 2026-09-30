import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { renderAsync } from 'docx-preview';
import {
  Upload, FileText, Download, CheckCircle, AlertCircle, History,
  Search, FileArchive, FolderPlus, Lock, Unlock,
  LogOut, User, Loader2, ChevronDown, ChevronUp, Users, Settings,
  Plus, Trash2, Edit, Save, FileCode, Check, Calendar, Clock, DollarSign,
  Sun, Moon, ArrowUpDown, Filter, Eye, Edit3, FileSpreadsheet,
} from 'lucide-react';

// Configuración producción / Railway
axios.defaults.withCredentials = true;

const api = axios.create({
baseURL: 'https://sistema-cancelaciones-production-3c4b.up.railway.app/api',
  withCredentials: true // <--- CRUCIAL para cookies
});

// 🛡️ Interceptor para manejar respuestas y filtrar ruidos de 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si la sesión no es válida (401), es un comportamiento esperado al abrir la app sin loguearse
    if (error.response && error.response.status === 401) {
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

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
      alert("No hay datos para exportar.");
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
        alert("Error al generar CSV: " + err.message);
      }
    }

    // 2. EXPORTAR A IMAGEN (PNG)
    if (format === 'image') {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const element = document.getElementById('tabla-historial-export');
        if (!element) {
          alert("No se encontró la tabla para captura.");
          return;
        }
        const canvas = await html2canvas(element, { scale: 2 });
        const link = document.createElement('a');
        link.download = `Reporte_Expedientes_${now.toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (err) {
        alert("Para exportar a imagen, instala html2canvas con: npm install html2canvas");
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
    credito_a_salario: ''
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

  // Validar sesión activa al recargar la página (F5)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get('/auth/me', { withCredentials: true });
        if (response.data && response.data.user) {
          setIsAuthenticated(true);
          setCurrentUser(response.data.user);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Error verificando sesión al recargar:", error);
        setIsAuthenticated(false);
        setCurrentUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    verificarSesion();
  }, []);

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
      const res = await api.get('/auth/me');
      if (res.data?.user) {
        setCurrentUser(res.data.user);
        setIsAuthenticated(true);
      }
    } catch {
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
    try {
      const res = await api.get('/expedientes', {
        params: { usuario: currentUser.username }
      });
      setHistorial(res.data || []);
    } catch (err) {
      console.error('Error al cargar historial:', err);
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
      alert("Por favor, arrastra un archivo Excel o CSV válido.");
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
    const res = await fetch('https://sistema-cancelaciones-production.up.railway.app/api/expedientes/previsualizar-excel', {
      method: 'POST',
      body: dataForm
    });
    const data = await res.json();
    if (res.ok && data.status === 'exito') {
      setFilasPreview(data.filas);
      setFilasSeleccionadas(data.filas.map(f => f.index)); // Seleccionados por defecto todos
    } else {
      alert('Error al previsualizar: ' + (data.detail || 'Archivo inválido'));
    }
  } catch (err) {
    console.error(err);
    alert('Error de conexión al leer el Excel.');
  } finally {
    setCargando(false);
  }
};


 const handleManualSubmit = async (e) => {
  e.preventDefault();
  setCargando(true);
  
  try {
    const API_URL = import.meta.env.VITE_API_URL || 'https://sistema-cancelaciones-production.up.railway.app';
    
    // Usamos axios en lugar de fetch para mantener la consistencia con el resto de la app
    const response = await axios.post(`${API_URL}/api/expedientes/generar-manual`, {
      ...formData,
      plantilla: selectedPlantilla || 'plantilla_manera2.docx'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data;
    if (data.status === 'exito') {
      alert('¡Expediente manual generado con éxito!');
      if (typeof setExpedientes === 'function' && Array.isArray(expedientes)) {
        setExpedientes([data, ...expedientes]);
      }
    }
  } catch (err) {
    console.error(err);
    const mensajeError = err.response?.data?.detail || 'No se pudo generar el expediente';
    alert('Error: ' + mensajeError);
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
    try {
      const formDataObj = new FormData();
      formDataObj.append('username', nuevoUsuario.username);
      formDataObj.append('password', nuevoUsuario.password);
      formDataObj.append('es_admin', nuevoUsuario.es_admin);

      await api.post('/admin/usuarios', formDataObj);
      setNuevoUsuario({ username: '', password: '', role: 'operador', es_admin: false });
      cargarUsuarios();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al crear usuario.');
    }
  };

  const handleEliminarUsuario = async (param1, param2) => {
    if (param1 && param1.preventDefault) {
      param1.preventDefault();
    }

    const usuarioId = typeof param1 === 'string' ? param1 : param2;

    if (!usuarioId || typeof usuarioId !== 'string') {
      alert('ID de usuario no válido');
      return;
    }

    if (!window.confirm('¿Estás seguro de que deseas eliminar este usuario?')) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      alert('Sesión no válida o expirada. Por favor, vuelve a iniciar sesión.');
      return;
    }

    try {
      const response = await fetch(
        `https://sistema-cancelaciones-production.up.railway.app/api/admin/usuarios/${usuarioId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        alert('Sesión no válida o expirada. Por favor, inicia sesión nuevamente.');
        return;
      }

      if (!response.ok) {
        alert(data.detail || 'Error al eliminar usuario');
        return;
      }

      alert('Usuario eliminado correctamente');
      cargarUsuarios();
    } catch (error) {
      console.error('Error al borrar usuario:', error);
      alert('Error de conexión al eliminar usuario');
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
      alert('Plantilla subida correctamente.');
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al subir la plantilla.');
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
        alert("⚠️ Solo se permite un máximo de 2 archivos para el trámite individual.");
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
        setDatos({
          acreditado: rawDatos.acreditado || rawDatos.nombre_acreditado || '',
          monto: rawDatos.monto || rawDatos.monto_credito || '',
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

    setBatchResults(prev => {
      const updated = [...prev];
      selectedBatchIndices.forEach(index => {
        if (updated[index]) {
          updated[index].plantilla_seleccionada = plantillaElegida;
        }
      });
      return updated;
    });

    for (const index of selectedBatchIndices) {
      await actualizarVistaPreviaMasivaTiempoReal(index);
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
              acreditado: raw.acreditado || raw.nombre_acreditado || '',
              monto: raw.monto || raw.monto_credito || '',
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
      alert("Error: No se encontró un ID de expediente válido para la descarga.");
      return;
    }

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

  } catch (err) {
    console.error("Error al descargar el archivo Word:", err);
    alert("No se pudo descargar el archivo Word desde el servidor.");
  }
};



const handleExcelSubmit = async (e) => {
  e.preventDefault();
  if (!archivoExcel) return alert('Por favor selecciona un archivo Excel (.xlsx o .csv)');
  if (!filasSeleccionadas || filasSeleccionadas.length === 0) {
    return alert('Selecciona al menos una fila en la tabla para procesar.');
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

      const res = await fetch('https://sistema-cancelaciones-production.up.railway.app/api/expedientes/procesar-excel', {
        method: 'POST',
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
      const resZip = await fetch('https://sistema-cancelaciones-production.up.railway.app/api/expedientes/descargar-zip', {
        method: 'POST',
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
    alert('Error en lote: ' + err.message);
  } finally {
    setCargando(false);
  }
};

  const handleDownloadZip = async () => {
    const ids = batchResults.map((r) => r.expediente_id);
    try {
      const res = await api.post('/expedientes/descargar-zip', ids, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Cancelaciones_Lote.zip');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Error al descargar el archivo ZIP.');
    }
  };

  const formatLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

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

  return (
    <div style={{
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
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: isDarkMode ? '#0b0f19' : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}>
          {/* Tarjeta de login animada */}
          <div className="slide-up" style={{ maxWidth: '420px', width: '100%', backgroundColor: theme.cardBg, padding: '40px 32px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button onClick={toggleTheme} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textSecondary }}>
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
            {isLoggingIn ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Loader2 size={48} color={theme.accent} style={{ margin: '0 auto 20px auto', display: 'block', animation: 'spin 1s linear infinite' }} />
                <h3 style={{ margin: '0 0 8px 0', color: theme.textPrimary, fontSize: '18px', fontWeight: '600' }}>Cargando perfil...</h3>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <div style={{ backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff', width: '64px', height: '64px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                    <Lock color={theme.accent} size={30} />
                  </div>
                  <h2 style={{ margin: '0 0 6px 0', color: theme.textPrimary, fontSize: '24px', fontWeight: '700' }}>Acceso al Sistema</h2>
                </div>

                {loginError && (
                  <div style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', borderLeft: '4px solid #ef4444', color: isDarkMode ? '#fca5a5' : '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertCircle size={18} />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleLogin}>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '8px' }}>Usuario</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '0 14px', backgroundColor: theme.inputBg }}>
                      <User size={18} color={theme.textSecondary} />
                      <input
                        type="text"
                        value={loginUser}
                        onChange={(e) => setLoginUser(e.target.value)}
                        required
                        style={{ width: '100%', padding: '12px 10px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent', color: theme.textPrimary }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '28px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '8px' }}>Contraseña</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '0 14px', backgroundColor: theme.inputBg }}>
                      <Lock size={18} color={theme.textSecondary} />
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        style={{ width: '100%', padding: '12px 10px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent', color: theme.textPrimary }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="pulse-hover"
                    style={{ width: '100%', backgroundColor: theme.accent, color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: '600', fontSize: '15px', cursor: 'pointer' }}
                  >
                    Ingresar a mi Perfil
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="fade-in" style={{ 
          display: 'flex',
          minHeight: '100vh',
          width: '100%',
          backgroundColor: theme.bg
        }}>
          
          {/* BARRA LATERAL (SIDEBAR) - DISEÑO HÍBRIDO */}
          <aside style={{
            width: '280px',
            backgroundColor: theme.cardBg,
            borderRight: `1px solid ${theme.border}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '24px 16px',
            boxSizing: 'border-box',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowY: 'auto'
          }}>
            <div>
              {/* Logo / Título del Sistema */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', paddingLeft: '8px' }}>
                <div style={{ backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
                  <FileText color={theme.accent} size={24} />
                </div>
                <div>
                  <h1 style={{ color: theme.textPrimary, margin: '0 0 2px 0', fontSize: '16px', fontWeight: '700', letterSpacing: '-0.3px' }}>
                    Cancelación de Hipotecas
                  </h1>
                  <p style={{ color: theme.textSecondary, margin: 0, fontSize: '11px', fontWeight: '500' }}>
                    Gestión Notarial
                  </p>
                </div>
              </div>

              {/* NAVEGACIÓN VERTICAL (TABS) */}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={() => setActiveTab('single')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'single' ? theme.accent : 'transparent',
                    color: activeTab === 'single' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <FileText size={18} /> Caso Individual
                </button>

                <button
                  onClick={() => setActiveTab('batch')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'batch' ? theme.accent : 'transparent',
                    color: activeTab === 'batch' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <FolderPlus size={18} /> Carga Masiva (PDFs)
                </button>

                <button
                  onClick={() => setActiveTab('manual')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'manual' ? theme.accent : 'transparent',
                    color: activeTab === 'manual' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <Edit3 size={18} /> Captura Manual
                </button>

                <button
                  onClick={() => setActiveTab('excel')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'excel' ? theme.accent : 'transparent',
                    color: activeTab === 'excel' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <FileSpreadsheet size={18} /> Carga Excel / Lote
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  className="pulse-hover"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeTab === 'history' ? theme.accent : 'transparent',
                    color: activeTab === 'history' ? '#fff' : theme.textSecondary,
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    transition: 'background-color 0.2s ease, color 0.2s ease'
                  }}
                >
                  <History size={18} /> Mi Historial
                </button>

                {esAdmin && (
                  <>
                    <div style={{ height: '1px', backgroundColor: theme.border, margin: '12px 0' }} />
                    <span style={{ fontSize: '11px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', paddingLeft: '14px', marginBottom: '4px', letterSpacing: '0.5px' }}>Administración</span>
                    
                    <button
                      onClick={() => setActiveTab('users')}
                      className="pulse-hover"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: activeTab === 'users' ? theme.accent : 'transparent',
                        color: activeTab === 'users' ? '#fff' : theme.textSecondary,
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        textAlign: 'left',
                        transition: 'background-color 0.2s ease, color 0.2s ease'
                      }}
                    >
                      <Users size={18} /> Usuarios
                    </button>

                    <button
                      onClick={() => setActiveTab('templates')}
                      className="pulse-hover"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: activeTab === 'templates' ? theme.accent : 'transparent',
                        color: activeTab === 'templates' ? '#fff' : theme.textSecondary,
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        textAlign: 'left',
                        transition: 'background-color 0.2s ease, color 0.2s ease'
                      }}
                    >
                    </button>
                  </>
                )}
              </nav>
            </div>

            {/* Footer de la Barra Lateral (Perfil y Tema) */}
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ backgroundColor: theme.accent, color: '#fff', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px' }}>
                    {currentUser?.username?.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.textPrimary, maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.username}</div>
                    <div style={{ fontSize: '10px', color: theme.textSecondary, textTransform: 'uppercase' }}>{currentUser?.role || (currentUser?.es_admin ? 'admin' : 'operador')}</div>
                  </div>
                </div>
                <button 
                  onClick={toggleTheme} 
                  className="pulse-hover"
                  style={{ background: theme.subtleBg, border: `1px solid ${theme.border}`, color: theme.textPrimary, padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Cambiar Tema"
                >
                  {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>

              <button
                onClick={() => setShowLogoutModal(true)}
                className="pulse-hover"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: isDarkMode ? '#450a0a' : '#fff1f2', color: '#dc2626', border: '1px solid #fecdd3', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
              >
                <LogOut size={16} /> Cerrar Sesión
              </button>
            </div>
          </aside>

          {/* CONTENIDO PRINCIPAL */}
          <main style={{ flex: 1, padding: '32px', boxSizing: 'border-box', overflowY: 'auto' }}>
            
            {/* NOTIFICACIÓN DE ERROR */}
            {error && (
              <div className="slide-up" style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fef2f2', borderLeft: '4px solid #ef4444', color: isDarkMode ? '#fca5a5' : '#991b1b', padding: '14px 18px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            {/* CONTENEDOR DE TARJETA PRINCIPAL */}
            <div style={{ backgroundColor: theme.cardBg, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '32px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              {/* TAB: CASO INDIVIDUAL */}
{activeTab === 'single' && (
  <div style={{ 
    display: 'grid', 
    gridTemplateColumns: datos ? (mostrarVistaPrevia ? '1fr 1fr 1.2fr' : '1fr 1fr') : '1fr', 
    gap: '24px',
    transition: 'all 0.3s ease',
    alignItems: 'start'
  }}>
    {/* COLUMNA 1: FORMULARIO DE CARGA DE ARCHIVOS */}
    <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Upload size={20} color={theme.accent} /> Cargar Expediente Individual
      </h2>

      {/* SELECTOR DE PLANTILLA NOTARIAL 2026 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textPrimary, marginBottom: '8px' }}>
          📜 Selecciona la Plantilla Notarial (Modelo 2026):
        </label>
        <select
          value={selectedPlantilla}
          onChange={(e) => setSelectedPlantilla(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.inputBg,
            color: theme.textPrimary,
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          <optgroup label="CDMX - APERTURA DE CRÉDITO">
            <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
            <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
            <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
            <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
          </optgroup>

          <optgroup label="CONTRATO DE MUTUO">
            <option value="CDMX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
            <option value="CDMX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
            <option value="CDMX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
            <option value="CDMX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
          </optgroup>

          <optgroup label="MODELOS COACREDITADOS">
            <option value="COAC_CDMX_AP">CDMX - Ap. Crédito</option>
            <option value="COAC_CDMX_MUTUO">CDMX - C. Mutuo</option>
            <option value="COAC_EDOMEX_AP">EDOMEX - Ap. Crédito</option>
            <option value="COAC_EDOMEX_MUTUO">EDOMEX - C. Mutuo</option>
          </optgroup>

          <optgroup label="3.EDOMEX - APERTURA DE CRÉDITO">
            <option value="EDOMEX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
            <option value="EDOMEX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
            <option value="EDOMEX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
            <option value="EDOMEX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
          </optgroup>

          <optgroup label="CONTRATO DE MUTUO">
            <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
            <option value="EDOMEX_MUTUO_H_CASADO"> C. Mutuo - Hombre Casado</option>
            <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
            <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
          </optgroup>
        </select>
      </div>

      <div 
        onDragOver={handleDragOver}
        onDrop={handleDropSingle}
        style={{ border: `2px dashed ${theme.dropzoneBorder}`, backgroundColor: theme.dropzoneBg, borderRadius: '12px', padding: '32px 20px', textAlign: 'center', marginBottom: '20px', cursor: 'pointer' }}
      >
        <FileText size={40} color={theme.accent} style={{ margin: '0 auto 12px auto' }} />
        <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: theme.textPrimary }}>
          Arrastra aquí tus archivos PDF
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: theme.textSecondary }}>o selecciona manualmente desde tu equipo</p>
        <input
          type="file"
          multiple
          accept=".pdf"
          onChange={handleSingleFileChange}
          style={{ display: 'none' }}
          id="single-file-input"
        />
        <label htmlFor="single-file-input" style={{ backgroundColor: theme.subtleBg, border: `1px solid ${theme.border}`, padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: theme.textPrimary, cursor: 'pointer' }}>
          Buscar Archivos
        </label>
      </div>

      {singleFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: theme.textSecondary }}>
            Archivos Seleccionados ({singleFiles.length}):
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
            {singleFiles.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', backgroundColor: theme.subtleBg, marginBottom: '6px', fontSize: '13px', color: theme.textPrimary }}>
                <FileText size={14} color={theme.textSecondary} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: theme.textSecondary }}>
            <span>Procesando documentos...</span>
            <span>{progressSingle}%</span>
          </div>
          <div style={{ width: '100%', backgroundColor: theme.subtleBg, height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progressSingle}%`, backgroundColor: theme.accent, height: '100%', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      <button
        onClick={handleUploadSingle}
        disabled={singleFiles.length === 0 || loading}
        style={{
          width: '100%',
          backgroundColor: singleFiles.length === 0 || loading ? theme.subtleBg : theme.accent,
          color: singleFiles.length === 0 || loading ? theme.textSecondary : '#fff',
          border: 'none',
          padding: '12px',
          borderRadius: '10px',
          fontWeight: '600',
          fontSize: '14px',
          cursor: singleFiles.length === 0 || loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
        Procesar Expediente
      </button>
    </div>

    {/* COLUMNA 2: DATOS EXTRAÍDOS Y EDITABLES */}
    {datos && (
      <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={20} color="#10b981" /> Datos Extraídos
          </h2>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* BOTÓN DE VISTA PREVIA */}
            <button
              onClick={handleGenerarVistaPrevia}
              disabled={cargandoPreview}
              style={{ 
                backgroundColor: theme.subtleBg, 
                color: theme.textPrimary, 
                border: `1px solid ${theme.border}`, 
                padding: '8px 12px', 
                borderRadius: '8px', 
                fontWeight: '600', 
                fontSize: '13px', 
                cursor: cargandoPreview ? 'wait' : 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px' 
              }}
            >
              {cargandoPreview ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={14} color={theme.accent} />} 
              {mostrarVistaPrevia ? 'Actualizar Previa' : 'Vista Previa'}
            </button>

            {/* BOTÓN DESCARGAR WORD */}
            <button
              onClick={() => handleDownloadWord(expedienteId, datos)}
              style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} /> Descargar Word
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
          {Object.entries(datos).map(([key, val]) => {
            const isUnlocked = unlockedFields[`single_${key}`];
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary }}>
                  {formatLabel(key)}
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                                type="text"
                                value={val || ''}
                                disabled={!isUnlocked}
                                onChange={(e) => handleInputChange(key, e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: val === "NO_ENCONTRADO" ? '1px solid #dc3545' : `1px solid ${theme.border}`,
                                    backgroundColor: val === "NO_ENCONTRADO" ? '#fff8f8' : (isUnlocked ? theme.inputBg : theme.subtleBg),
                                    color: val === "NO_ENCONTRADO" ? '#dc3545' : theme.textPrimary,
                                    fontSize: '13px',
                                    fontWeight: val === "NO_ENCONTRADO" ? '600' : 'normal',
                                    opacity: isUnlocked ? 1 : 0.8
                                }}
                            />
                  <button
                    type="button"
                    onClick={() => handleToggleUnlock(`single_${key}`)}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: isUnlocked ? '#fef3c7' : theme.subtleBg,
                      color: isUnlocked ? '#d97706' : theme.textSecondary,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {isUnlocked ? <Unlock size={16} /> : <Lock size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* COLUMNA 3: VISTA PREVIA (CON ENCABEZADO CORREGIDO) */}
    {mostrarVistaPrevia && (
      <div style={{ 
        backgroundColor: theme.cardBg, 
        borderRadius: '16px', 
        border: `1px solid ${theme.border}`,
        height: '650px',
        maxHeight: '650px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}>
        
        {/* Reglas CSS para docx-preview */}
        <style>{`
          .docx-container-scroll {
            height: 100% !important;
            max-height: 100% !important;
            overflow-y: auto !important;
          }
          .docx-container-scroll .docx-wrapper {
            background-color: transparent !important;
            padding: 12px 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 16px !important;
          }
          .docx-container-scroll .docx-wrapper > section {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
            border-radius: 6px !important;
            margin-bottom: 0 !important;
            background-color: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 16px !important;
            box-sizing: border-box !important;
          }
          .docx-container-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .docx-container-scroll::-webkit-scrollbar-thumb {
            background-color: rgba(156, 163, 175, 0.5);
            border-radius: 8px;
          }
        `}</style>

        {/* Encabezado Vista Previa con el botón alineado a la derecha extrema */}
<div style={{ 
  padding: '14px 16px', 
  borderBottom: `1px solid ${theme.border}`, 
  display: 'flex', 
  flexDirection: 'row',
  justifyContent: 'space-between', 
  alignItems: 'center',
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: theme.subtleBg
}}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <Eye size={18} color={theme.accent} />
    <span style={{ fontSize: '15px', fontWeight: '700', color: theme.textPrimary }}>
      Vista Previa
    </span>
  </div>

  <button
    onClick={() => {
      if (previewContainerRef.current) {
        previewContainerRef.current.innerHTML = "";
      }
      setMostrarVistaPrevia(false);
    }}
    style={{ 
      backgroundColor: '#ef4444', 
      color: '#ffffff', 
      border: 'none', 
      padding: '5px 12px', 
      borderRadius: '20px', 
      fontWeight: '600', 
      fontSize: '12px', 
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)',
      marginLeft: 'auto'
    }}
    title="Cerrar vista previa"
  >
    <span>Cerrar</span>
    <span style={{ fontSize: '12px', fontWeight: 'bold' }}>✕</span>
  </button>
</div>

        {/* Visor de documento con scroll */}
        <div style={{ flex: 1, padding: '12px', overflow: 'hidden', backgroundColor: theme.dropzoneBg }}>
          {cargandoPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px', color: theme.textSecondary }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Cargando vista previa...</span>
            </div>
          ) : (
            <div 
              ref={previewContainerRef} 
              className="docx-container-scroll"
            />
          )}
        </div>

      </div>
    )}
  </div>
)}

              {/* TAB: CARGA MASIVA */}
{activeTab === 'batch' && (
  <div>
    {/* SECCIÓN SUPERIOR: FORMULARIO DE CARGA */}
    <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}`, marginBottom: '24px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FolderPlus size={20} color={theme.accent} /> Carga Masiva de Expedientes
      </h2>

      <div 
        onDragOver={handleDragOver}
        onDrop={handleDropBatch}
        style={{ border: `2px dashed ${theme.dropzoneBorder}`, backgroundColor: theme.dropzoneBg, borderRadius: '12px', padding: '32px 20px', textAlign: 'center', marginBottom: '20px', cursor: 'pointer' }}
      >
        <FileArchive size={40} color={theme.accent} style={{ margin: '0 auto 12px auto' }} />
        <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: theme.textPrimary }}>
          Arrastra aquí tu carpeta o múltiples archivos PDF
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: theme.textSecondary }}>se escanearán subcarpetas automáticamente</p>
        <input
          type="file"
          multiple
          accept=".pdf"
          webkitdirectory="true"
          onChange={handleBatchFileChange}
          style={{ display: 'none' }}
          id="batch-file-input"
        />
        <label htmlFor="batch-file-input" style={{ backgroundColor: theme.subtleBg, border: `1px solid ${theme.border}`, padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: theme.textPrimary, cursor: 'pointer' }}>
          Buscar Carpeta / Archivos
        </label>
      </div>

      {batchFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: theme.textSecondary }}>
            Archivos Detectados ({batchFiles.length}):
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
            {batchFiles.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', backgroundColor: theme.subtleBg, marginBottom: '6px', fontSize: '13px', color: theme.textPrimary }}>
                <FileText size={14} color={theme.textSecondary} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {batchLoading && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: theme.textSecondary }}>
            <span>Procesando lote de documentos...</span>
            <span>{progressBatch}%</span>
          </div>
          <div style={{ width: '100%', backgroundColor: theme.subtleBg, height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progressBatch}%`, backgroundColor: theme.accent, height: '100%', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      <button
        onClick={handleUploadBatch}
        disabled={batchFiles.length === 0 || batchLoading}
        style={{
          width: '100%',
          backgroundColor: batchFiles.length === 0 || batchLoading ? theme.subtleBg : theme.accent,
          color: batchFiles.length === 0 || batchLoading ? theme.textSecondary : '#fff',
          border: 'none',
          padding: '12px',
          borderRadius: '10px',
          fontWeight: '600',
          fontSize: '14px',
          cursor: batchFiles.length === 0 || batchLoading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        {batchLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <FolderPlus size={16} />}
        Procesar Carga Masiva
      </button>
    </div>

    {/* RESULTADOS DEL LOTE */}
    {batchResults.length > 0 && (
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: batchPreviewIndex !== null ? '1.2fr 1fr' : '1fr', 
        gap: '24px',
        alignItems: 'start',
        transition: 'all 0.3s ease'
      }}>
        
        {/* COLUMNA IZQUIERDA: LISTA Y ACORDEONES */}
        <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            
            {/* CHECKBOX MAESTRO, TÍTULO Y SELECTOR GLOBAL */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <input 
                type="checkbox"
                checked={batchResults.length > 0 && selectedBatchIndices.length === batchResults.length}
                onChange={handleSelectAllBatch}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: theme.accent }}
                title="Seleccionar todos"
              />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary }}>
                Resultados del Lote ({batchResults.length})
              </h2>

              {selectedBatchIndices.length > 0 && (
                <select
                  onChange={(e) => {
                    handleApplyTemplateToSelected(e.target.value);
                    e.target.value = "";
                  }}
                  defaultValue=""
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.inputBg,
                    color: theme.textPrimary,
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="" disabled>Aplicar a seleccionados ({selectedBatchIndices.length})...</option>
                  
                  <optgroup label="CDMX - APERTURA DE CRÉDITO">
            <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
            <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
            <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
            <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
          </optgroup>

          <optgroup label="CONTRATO DE MUTUO">
            <option value="CDMX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
            <option value="CDMX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
            <option value="CDMX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
            <option value="CDMX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
          </optgroup>

          <optgroup label="MODELOS COACREDITADOS">
            <option value="COAC_CDMX_AP">CDMX - Ap. Crédito</option>
            <option value="COAC_CDMX_MUTUO">CDMX - C. Mutuo</option>
            <option value="COAC_EDOMEX_AP">EDOMEX - Ap. Crédito</option>
            <option value="COAC_EDOMEX_MUTUO">EDOMEX - C. Mutuo</option>
          </optgroup>

          <optgroup label="3.EDOMEX - APERTURA DE CRÉDITO">
            <option value="EDOMEX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
            <option value="EDOMEX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
            <option value="EDOMEX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
            <option value="EDOMEX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
          </optgroup>

          <optgroup label="CONTRATO DE MUTUO">
            <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
            <option value="EDOMEX_MUTUO_H_CASADO"> C. Mutuo - Hombre Casado</option>
            <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
            <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
          </optgroup>
                </select>
              )}
            </div>

            <button
              onClick={handleDownloadZip}
              style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Download size={16} /> Descargar Todo (ZIP)
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
{batchResults.map((res, idx) => {
  if (res.error) {
    return (
      <div key={idx} style={{ border: '1px solid #ef4444', borderRadius: '10px', padding: '14px 18px', backgroundColor: '#fef2f2', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#b91c1c', fontSize: '14px', fontWeight: '600' }}>
          <span>⚠️ Error al procesar archivo:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{res.expediente_id}</span>
        </div>
        <p style={{ margin: '6px 0 0 28px', fontSize: '12px', color: '#7f1d1d' }}>
          Detalle: {res.error} (El resto del lote se a procesado con éxito).
        </p>
      </div>
    );
  }
  const isOpen = !!openAccordion[idx];
  const datosExtraidos = res.datos_extraidos || {};
  const acreditadoNombre = datosExtraidos.acreditado || datosExtraidos.nombre_acreditado || 'Acreditado no identificado';
  const isPreviewingThis = batchPreviewIndex === idx;
  const isSelected = selectedBatchIndices.includes(idx);

  return (
                <div key={idx} style={{ border: `1px solid ${isPreviewingThis ? theme.accent : theme.border}`, borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.2s ease' }}>
                  <div 
                    onClick={() => toggleAccordion(idx)}
                    style={{ padding: '14px 18px', backgroundColor: theme.subtleBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      
                      {/* CHECKBOX INDIVIDUAL */}
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleSelectBatch(idx);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }}
                      />

                      <CheckCircle size={18} color="#10b981" />
                      <span style={{ fontWeight: '600', fontSize: '14px', color: theme.textPrimary }}>
                        {acreditadoNombre}
                      </span>
                      {datosExtraidos.numero_credito && (
                        <span style={{ fontSize: '12px', color: theme.textSecondary, backgroundColor: theme.cardBg, padding: '2px 8px', borderRadius: '4px', border: `1px solid ${theme.border}` }}>
                          Crédito: {datosExtraidos.numero_credito}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      
                      {/* === MENÚ DESPLEGABLE DE PLANTILLAS === */}
                      <select
                        value={res.plantilla_seleccionada || ""}
                        onChange={(e) => handleBatchPlantillaChange(idx, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${theme.border}`,
                          backgroundColor: theme.inputBg,
                          color: theme.textPrimary,
                          fontSize: '12px',
                          outline: 'none',
                          cursor: 'pointer',
                          maxWidth: '220px',
                          textOverflow: 'ellipsis'
                        }}
                        title="Seleccionar plantilla para este expediente"
                      >
                        <option value="" disabled>Seleccionar plantilla...</option>
                        
                        <optgroup label="CDMX - APERTURA DE CRÉDITO">
            <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
            <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
            <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
            <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
          </optgroup>

          <optgroup label="CONTRATO DE MUTUO">
            <option value="CDMX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
            <option value="CDMX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
            <option value="CDMX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
            <option value="CDMX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
          </optgroup>

          <optgroup label="MODELOS COACREDITADOS">
            <option value="COAC_CDMX_AP">CDMX - Ap. Crédito</option>
            <option value="COAC_CDMX_MUTUO">CDMX - C. Mutuo</option>
            <option value="COAC_EDOMEX_AP">EDOMEX - Ap. Crédito</option>
            <option value="COAC_EDOMEX_MUTUO">EDOMEX - C. Mutuo</option>
          </optgroup>

          <optgroup label="3.EDOMEX - APERTURA DE CRÉDITO">
            <option value="EDOMEX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
            <option value="EDOMEX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
            <option value="EDOMEX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
            <option value="EDOMEX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
          </optgroup>

          <optgroup label="CONTRATO DE MUTUO">
            <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
            <option value="EDOMEX_MUTUO_H_CASADO"> C. Mutuo - Hombre Casado</option>
            <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
            <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
          </optgroup>
                      </select>
                      {/* =========================================== */}

                      {/* BOTÓN VISTA PREVIA INDIVIDUAL EN LOTE */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBatchPreviewIndex(idx);
                          actualizarVistaPreviaMasivaTiempoReal(idx);
                        }}
                        style={{ 
                          backgroundColor: isPreviewingThis ? theme.accent : theme.cardBg, 
                          color: isPreviewingThis ? '#fff' : theme.textPrimary, 
                          border: `1px solid ${theme.border}`, 
                          padding: '6px 10px', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          fontWeight: '600', 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px' 
                        }}
                      >
                        <Eye size={12} color={isPreviewingThis ? '#fff' : theme.accent} /> 
                        {isPreviewingThis ? 'Viendo' : 'Previa'}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadWord(res.expediente_id, datosExtraidos);
                        }}
                        style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Download size={12} /> DOCX
                      </button>
                      {isOpen ? <ChevronUp size={18} color={theme.textSecondary} /> : <ChevronDown size={18} color={theme.textSecondary} />}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '18px', backgroundColor: theme.cardBg, borderTop: `1px solid ${theme.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                      {Object.entries(datosExtraidos).map(([bKey, bVal]) => {
                        const fieldKey = `batch_${idx}_${bKey}`;
                        const isUnlocked = unlockedFields[fieldKey];

                        return (
                          <div key={bKey} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '600', color: theme.textSecondary }}>
                              {formatLabel(bKey)}
                            </label>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={bVal || ''}
                                disabled={!isUnlocked}
                                onChange={(e) => handleBatchInputChange(idx, bKey, e.target.value)}
                                style={{
                                  flex: 1,
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  border: `1px solid ${theme.border}`,
                                  backgroundColor: isUnlocked ? theme.inputBg : theme.subtleBg,
                                  color: theme.textPrimary,
                                  fontSize: '12px',
                                  opacity: isUnlocked ? 1 : 0.8
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleToggleUnlock(fieldKey)}
                                style={{
                                  padding: '8px',
                                  borderRadius: '6px',
                                  border: `1px solid ${theme.border}`,
                                  backgroundColor: isUnlocked ? '#fef3c7' : theme.subtleBg,
                                  color: isUnlocked ? '#d97706' : theme.textSecondary,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                {isUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA DERECHA: PANEL DE VISTA PREVIA MASIVA */}
        {batchPreviewIndex !== null && (
          <div style={{ 
            backgroundColor: theme.cardBg, 
            borderRadius: '16px', 
            border: `1px solid ${theme.border}`,
            height: '650px',
            maxHeight: '650px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'sticky',
            top: '24px'
          }}>
            
            {/* Reglas CSS para scroll interno */}
            <style>{`
              .docx-container-scroll {
                height: 100% !important;
                max-height: 100% !important;
                overflow-y: auto !important;
              }
              .docx-container-scroll .docx-wrapper {
                background-color: transparent !important;
                padding: 12px 0 !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                gap: 16px !important;
              }
              .docx-container-scroll .docx-wrapper > section {
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
                border-radius: 6px !important;
                margin-bottom: 0 !important;
                background-color: #ffffff !important;
                border: 1px solid #e2e8f0 !important;
                width: 100% !important;
                max-width: 100% !important;
                padding: 16px !important;
                box-sizing: border-box !important;
              }
              .docx-container-scroll::-webkit-scrollbar {
                width: 6px;
              }
              .docx-container-scroll::-webkit-scrollbar-thumb {
                background-color: rgba(156, 163, 175, 0.5);
                border-radius: 8px;
              }
            `}</style>

            {/* Encabezado del visor */}
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: `1px solid ${theme.border}`, 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              backgroundColor: theme.subtleBg
            }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={18} color={theme.accent} /> 
                Previa ({batchResults[batchPreviewIndex]?.datos_extraidos?.acreditado || 'Expediente'})
              </h2>

              {/* Botón de cierre píldora */}
              <button
                onClick={() => {
                  if (batchPreviewRef.current) {
                    batchPreviewRef.current.innerHTML = "";
                  }
                  setBatchPreviewIndex(null);
                }}
                style={{ 
                  backgroundColor: '#ef4444', 
                  color: '#ffffff', 
                  border: 'none', 
                  padding: '5px 12px', 
                  borderRadius: '20px', 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)',
                  transition: 'all 0.2s ease'
                }}
                title="Cerrar vista previa"
              >
                <span>Cerrar</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', marginLeft: '2px' }}>✕</span>
              </button>
            </div>

            {/* Contenedor de la vista previa en tiempo real */}
            <div style={{ flex: 1, padding: '12px', overflow: 'hidden', backgroundColor: theme.dropzoneBg }}>
              <div 
                ref={batchPreviewRef} 
                className="docx-container-scroll"
              />
            </div>

          </div>
        )}

      </div>
    )}
  </div>
)}

              {/* VISTA DE CAPTURA MANUAL CON TODOS LOS CAMPOS, SELECTOR 2026 Y VISTA PREVIA */}
{activeTab === 'manual' && (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', alignItems: 'start' }}>    

    {/* COLUMNA IZQUIERDA: FORMULARIO */}
    <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}`, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
      <h3 style={{ color: theme.textPrimary, marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>Generación Manual de Caso Individual</h3>
      
      <form onSubmit={async (e) => {
        e.preventDefault();
        setCargando(true);
        try {
          // Recuperar token de autenticación si lo guardas en localStorage (para evitar el error 401)
          const token = localStorage.getItem('token') || '';

          const res = await fetch('https://sistema-cancelaciones-production.up.railway.app/api/expedientes/generar-manual', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ ...formData, plantilla: selectedPlantilla || 'CDMX_AP_H_SOLTERO' })
          });
          const data = await res.json();
          if (res.ok && data.status === 'exito') {
            alert('¡Expediente manual generado con éxito, revisa tu Historial!');
            
            if (data.archivo_base64 && manualPreviewRef.current) {
              const binaryString = window.atob(data.archivo_base64);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              await window.docx.renderAsync(bytes.buffer, manualPreviewRef.current, null, {
                className: "docx-wrapper",
                inWrapper: true,
                ignoreWidth: false,
                ignoreHeight: false,
              });
            }

            if (typeof setExpedientes === 'function' && Array.isArray(expedientes)) {
              setExpedientes([data, ...expedientes]);
            }
          } else {
            alert('Error: ' + (data.detail || 'No se pudo generar'));
          }
        } catch (err) {
          console.error(err);
          alert('Error de conexión con el servidor.');
        } finally {
          setCargando(false);
        }
      }} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        
        {/* SELECTOR DE PLANTILLA NOTARIAL 2026 (Ocupa todo el ancho) */}
        <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textPrimary, marginBottom: '8px' }}>
            📜 Selecciona la Plantilla Notarial (Modelo 2026):
          </label>
          <select
            value={selectedPlantilla}
            onChange={(e) => setSelectedPlantilla(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.inputBg || '#fff',
              color: theme.textPrimary,
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <optgroup label="CDMX - APERTURA DE CRÉDITO">
              <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
              <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
              <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
              <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
            </optgroup>
            <optgroup label="CONTRATO DE MUTUO">
              <option value="CDMX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
              <option value="CDMX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
              <option value="CDMX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
              <option value="CDMX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
            </optgroup>
            <optgroup label="MODELOS COACREDITADOS">
              <option value="COAC_CDMX_AP">CDMX - Ap. Crédito</option>
              <option value="COAC_CDMX_MUTUO">CDMX - C. Mutuo</option>
              <option value="COAC_EDOMEX_AP">EDOMEX - Ap. Crédito</option>
              <option value="COAC_EDOMEX_MUTUO">EDOMEX - C. Mutuo</option>
            </optgroup>
            <optgroup label="EDOMEX - APERTURA DE CRÉDITO">
              <option value="EDOMEX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
              <option value="EDOMEX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
              <option value="EDOMEX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
              <option value="EDOMEX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
            </optgroup>
            <optgroup label="EDOMEX - CONTRATO DE MUTUO">
              <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
              <option value="EDOMEX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
              <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
              <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
            </optgroup>
          </select>
        </div>

        {/* TODOS LOS CAMPOS DEL FORMULARIO MANUAL */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Número de Crédito *</label>
          <input
            type="text"
            required
            placeholder="Ej. 0903066392"
            value={formData.numero_credito}
            onChange={e => setFormData({...formData, numero_credito: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Nombre del Acreditado *</label>
          <input
            type="text"
            required
            placeholder="Ej. MARIA IDALIA CARRASCO BARDALES"
            value={formData.nombre_acreditado}
            onChange={e => setFormData({...formData, nombre_acreditado: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Monto del Crédito</label>
          <input
            type="text"
            placeholder="Ej. 150000.00"
            value={formData.monto_credito}
            onChange={e => setFormData({...formData, monto_credito: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Oficina Registral</label>
          <input
            type="text"
            placeholder="Ej. TOLUCA"
            value={formData.oficina_registral}
            onChange={e => setFormData({...formData, oficina_registral: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Número de Carta</label>
          <input
            type="text"
            value={formData.numero_carta}
            onChange={e => setFormData({...formData, numero_carta: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Entidad Financiera (Banco)</label>
          <input
            type="text"
            placeholder="Ej. INFONAVIT"
            value={formData.entidad_financiera}
            onChange={e => setFormData({...formData, entidad_financiera: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Fecha de Liquidación</label>
          <input
            type="text"
            value={formData.fecha_liquidacion}
            onChange={e => setFormData({...formData, fecha_liquidacion: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Folio Real</label>
          <input
            type="text"
            value={formData.folio_real}
            onChange={e => setFormData({...formData, folio_real: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Fecha de Expedición</label>
          <input
            type="text"
            value={formData.fecha_expedicion}
            onChange={e => setFormData({...formData, fecha_expedicion: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Crédito a Salario</label>
          <input
            type="text"
            value={formData.credito_a_salario}
            onChange={e => setFormData({...formData, credito_a_salario: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none' }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Datos del Inmueble</label>
          <textarea
            rows="2"
            value={formData.datos_inmueble}
            onChange={e => setFormData({...formData, datos_inmueble: e.target.value})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, outline: 'none', resize: 'vertical' }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
          <button
            type="submit"
            disabled={cargando}
            style={{ width: '100%', padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            {cargando ? 'Generando Documento...' : 'Generar documento en Mi Historial'}
          </button>
        </div>
      </form>
    </div>
  </div>
)}


              {/* VISTA DE CARGA EXCEL / LOTE */}
{activeTab === 'excel' && (() => {
  const filasPorPagina = 10;
  const totalPaginas = Math.ceil((filasPreview?.length || 0) / filasPorPagina);
  const indiceUltimaFila = paginaActual * filasPorPagina;
  const indicePrimeraFila = indiceUltimaFila - filasPorPagina;
  const filasPaginadas = (filasPreview || []).slice(indicePrimeraFila, indiceUltimaFila);

  const OpcionesPlantillas = () => (
    <>
      <optgroup label="CDMX - APERTURA DE CRÉDITO">
        <option value="CDMX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
        <option value="CDMX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
        <option value="CDMX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
        <option value="CDMX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
      </optgroup>
      <optgroup label="CDMX - CONTRATO DE MUTUO">
        <option value="CDMX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
        <option value="CDMX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
        <option value="CDMX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
        <option value="CDMX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
      </optgroup>
      <optgroup label="MODELOS COACREDITADOS">
        <option value="COAC_CDMX_AP">CDMX - Ap. Crédito</option>
        <option value="COAC_CDMX_MUTUO">CDMX - C. Mutuo</option>
        <option value="COAC_EDOMEX_AP">EDOMEX - Ap. Crédito</option>
        <option value="COAC_EDOMEX_MUTUO">EDOMEX - C. Mutuo</option>
      </optgroup>
      <optgroup label="EDOMEX - APERTURA DE CRÉDITO">
        <option value="EDOMEX_AP_H_SOLTERO">Ap. Crédito - Hombre Soltero</option>
        <option value="EDOMEX_AP_H_CASADO">Ap. Crédito - Hombre Casado</option>
        <option value="EDOMEX_AP_M_SOLTERA">Ap. Crédito - Mujer Soltera</option>
        <option value="EDOMEX_AP_M_CASADA">Ap. Crédito - Mujer Casada</option>
      </optgroup>
      <optgroup label="EDOMEX - CONTRATO DE MUTUO">
        <option value="EDOMEX_MUTUO_H_SOLTERO">C. Mutuo - Hombre Soltero</option>
        <option value="EDOMEX_MUTUO_H_CASADO">C. Mutuo - Hombre Casado</option>
        <option value="EDOMEX_MUTUO_M_SOLTERA">C. Mutuo - Mujer Soltera</option>
        <option value="EDOMEX_MUTUO_M_CASADA">C. Mutuo - Mujer Casada</option>
      </optgroup>
    </>
  );

  return (
    <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}`, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
      <h3 style={{ color: theme.textPrimary, marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>Carga Masiva mediante Excel o CSV</h3>
      
      {/* SELECTOR DE PLANTILLA GLOBAL */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: theme.textPrimary, marginBottom: '8px' }}>
          📜 Plantilla Notarial Global por Defecto (Modelo 2026):
        </label>
        <select
          value={selectedPlantilla}
          onChange={(e) => setSelectedPlantilla(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, fontSize: '13px', fontWeight: '600', cursor: 'pointer', outline: 'none' }}
        >
          <OpcionesPlantillas />
        </select>
      </div>

      {/* ZONA DE ARRASTRE O TABLA DE PREVISUALIZACIÓN */}
      {!filasPreview || filasPreview.length === 0 ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              const archivoArrastrado = e.dataTransfer.files[0];
              const nombre = archivoArrastrado.name.toLowerCase();
              if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls') || nombre.endsWith('.csv')) {
                await handlePreviewExcel(archivoArrastrado);
                setPaginaActual(1);
              } else {
                alert("Por favor, arrastra un archivo Excel o CSV válido (.xlsx, .xls, .csv)");
              }
            }
          }}
          style={{ border: `2px dashed ${theme.border}`, padding: '32px', borderRadius: '12px', textAlign: 'center', backgroundColor: theme.subtleBg, cursor: 'pointer', marginBottom: '16px' }}
        >
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={async (e) => {
              if (e.target.files[0]) {
                await handlePreviewExcel(e.target.files[0]);
                setPaginaActual(1);
              }
            }}
            style={{ display: 'none' }}
            id="excel-file-input"
          />
          <label htmlFor="excel-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%', height: '100%' }}>
            <FileSpreadsheet size={36} color={theme.accent} />
            <span style={{ color: theme.textPrimary, fontWeight: '600' }}>
              {archivoExcel ? archivoExcel.name : 'Haz clic para seleccionar tu archivo Excel o arrástralo aquí'}
            </span>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>Formatos permitidos: .xlsx, .xls, .csv</span>
          </label>
        </div>
      ) : (
        /* TABLA CON PAGINACIÓN Y SELECTOR POR FILA */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: theme.subtleBg, borderRadius: '8px' }}>
            <span style={{ color: theme.textPrimary, fontWeight: '600', fontSize: '14px' }}>
              Archivo: <strong>{archivoExcel?.name}</strong> ({filasPreview.length} registros - Pág. {paginaActual} de {totalPaginas})
            </span>
            <button
              onClick={() => { setFilasPreview([]); setArchivoExcel(null); setFilasSeleccionadas([]); setPaginaActual(1); }}
              style={{ padding: '6px 12px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
            >
              Cambiar Archivo
            </button>
          </div>

          <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.subtleBg }}>
                  <th style={{ padding: '12px', textAlign: 'center', width: '50px' }}>
                    <input 
                      type="checkbox"
                      disabled={cargando || filasPreview.length === 0}
                      checked={filasPreview.length > 0 && filasSeleccionadas.length === filasPreview.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilasSeleccionadas(filasPreview.map(f => f.index));
                        } else {
                          setFilasSeleccionadas([]);
                        }
                      }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }}
                    />
                  </th>
                  <th style={{ padding: '12px' }}>No. Crédito</th>
                  <th style={{ padding: '12px' }}>Acreditado</th>
                  <th style={{ padding: '12px' }}>Monto</th>
                  <th style={{ padding: '12px' }}>Plantilla Específica</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filasPaginadas.map((fila) => {
                  const isSelected = filasSeleccionadas.includes(fila.index);
                  const estadoFila = estadoFilas[fila.index];

                  return (
                    <tr key={fila.index} style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: isSelected ? (isDarkMode ? '#1e293b' : '#f8fafc') : 'transparent' }}>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          disabled={cargando}
                          onChange={() => {
                            if (isSelected) {
                              setFilasSeleccionadas(filasSeleccionadas.filter(i => i !== fila.index));
                            } else {
                              setFilasSeleccionadas([...filasSeleccionadas, fila.index]);
                            }
                          }}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: theme.accent }}
                        />
                      </td>
                      <td style={{ padding: '12px', color: theme.textPrimary, fontWeight: '500' }}>{fila.numero_credito || fila.credito || '-'}</td>
                      <td style={{ padding: '12px', color: theme.textPrimary }}>{fila.nombre_acreditado || fila.acreditado || '-'}</td>
                      <td style={{ padding: '12px', color: theme.textPrimary }}>{fila.monto_credito || fila.monto || '-'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <select
                          value={plantillasFilas?.[fila.index] || selectedPlantilla}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPlantillasFilas(prev => ({ ...prev, [fila.index]: val }));
                          }}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg || '#fff', color: theme.textPrimary, fontSize: '12px', cursor: 'pointer', outline: 'none' }}
                        >
                          <OpcionesPlantillas />
                        </select>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {estadoFila === 'completado' ? (
                          <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', display: 'inline-block' }}>
                            ✓ {contadoresRemosion[fila.index] !== undefined ? `Quitando en ${contadoresRemosion[fila.index]}s` : 'Completado'}
                          </span>
                        ) : estadoFila === 'procesando' ? (
                          <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', display: 'inline-block' }}>Procesando...</span>
                        ) : estadoFila === 'error' ? (
                          <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', display: 'inline-block' }}>✕ Error</span>
                        ) : (
                          <span style={{ color: '#ffa500', fontSize: '12px' }}>Pendiente</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* CONTROLES DE PAGINACIÓN */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px' }}>
              <button
                onClick={() => setPaginaActual(prev => Math.max(prev - 1, 1))}
                disabled={paginaActual === 1 || cargando}
                style={{ padding: '6px 14px', backgroundColor: paginaActual === 1 ? theme.subtleBg : theme.cardBg, color: paginaActual === 1 ? theme.textSecondary : theme.textPrimary, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: paginaActual === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600' }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: '13px', color: theme.textSecondary, fontWeight: '500' }}>
                Página <strong>{paginaActual}</strong> de <strong>{totalPaginas}</strong>
              </span>
              <button
                onClick={() => setPaginaActual(prev => Math.min(prev + 1, totalPaginas))}
                disabled={paginaActual === totalPaginas || cargando}
                style={{ padding: '6px 14px', backgroundColor: paginaActual === totalPaginas ? theme.subtleBg : theme.cardBg, color: paginaActual === totalPaginas ? theme.textSecondary : theme.textPrimary, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: paginaActual === totalPaginas ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600' }}
              >
                Siguiente →
              </button>
            </div>
          )}

          {/* BOTÓN DE ACCIÓN */}
          <button
            onClick={handleExcelSubmit}
            disabled={cargando || filasSeleccionadas.length === 0}
            style={{ width: '100%', padding: '14px 20px', backgroundColor: (cargando || filasSeleccionadas.length === 0) ? '#94a3b8' : theme.accent, color: '#ffffff', border: 'none', borderRadius: '10px', cursor: (cargando || filasSeleccionadas.length === 0) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '8px' }}
          >
            <span>⚡</span>
            {cargando ? 'Procesando lote y empaquetando ZIP...' : `Procesar Lote (${filasSeleccionadas.length} seleccionados)`}
          </button>

          {/* PROGRESO */}
          {cargando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: theme.subtleBg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: theme.textPrimary, fontWeight: '600' }}>
                <span>{textoProgreso}</span>
                <span>{progreso}%</span>
              </div>
              <div style={{ width: '100%', backgroundColor: theme.border, borderRadius: '8px', overflow: 'hidden', height: '10px' }}>
                <div style={{ width: `${progreso}%`, backgroundColor: theme.accent, height: '100%', transition: 'width 0.3s ease-in-out' }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
})()}


              {/* TAB: HISTORIAL */}
          {activeTab === 'history' && (
            <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={20} color={theme.accent} /> Historial de Expedientes
                </h2>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Búsqueda por texto */}
                  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '0 10px', backgroundColor: theme.inputBg }}>
                    <Search size={16} color={theme.textSecondary} />
                    <input
                      type="text"
                      placeholder="Buscar por acreditado o crédito..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ padding: '8px', border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', width: '200px' }}
                    />
                  </div>

                  {/* Selector de Periodo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '0 8px', backgroundColor: theme.inputBg }}>
                    <Filter size={14} color={theme.textSecondary} />
                    <select
                      value={filterPeriod}
                      onChange={(e) => setFilterPeriod(e.target.value)}
                      style={{ border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', padding: '8px 0', cursor: 'pointer' }}
                    >
                      <option value="all">Todo el historial</option>
                      <option value="day">Por Día</option>
                      <option value="month">Por Mes</option>
                      <option value="year">Por Año</option>
                    </select>
                  </div>

                  {/* Filtro Dinámico: Año */}
                  {filterPeriod !== 'all' && (
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  )}

                  {/* Filtro Dinámico: Mes */}
                  {(filterPeriod === 'day' || filterPeriod === 'month') && (
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      {mesesNombres.map((m, idx) => (
                        <option key={idx} value={idx}>{m}</option>
                      ))}
                    </select>
                  )}

                  {/* Filtro Dinámico: Día */}
                  {filterPeriod === 'day' && (
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', padding: '8px', cursor: 'pointer' }}
                    >
                      <option value="all">Todos los días</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>Día {d}</option>
                      ))}
                    </select>
                  )}

                  {/* Orden A-Z / Z-A */}
                  <button
                    onClick={() => setSortAscending(!sortAscending)}
                    title={sortAscending ? 'Orden A-Z' : 'Orden Z-A'}
                    style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, color: theme.textPrimary, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                  >
                    <ArrowUpDown size={14} />
                    {sortAscending ? 'A-Z' : 'Z-A'}
                  </button>
                </div>
              </div>

              {/* BARRA DE CONTEO Y BOTÓN GLOBAL DE EXPORTACIÓN */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: theme.subtleBg, borderRadius: '8px', marginBottom: '16px', border: `1px solid ${theme.border}`, flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: '600' }}>
                  Total encontrados: <span style={{ color: theme.accent, fontSize: '15px', fontWeight: '700' }}>{filteredHistorial.length}</span> expedientes
                </div>

                {/* MENÚ DESPLEGABLE GLOBAL DE EXPORTACIÓN */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, border: `1px solid ${theme.border}`, padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Download size={14} color={theme.accent} />
                    Exportar Reporte
                    <span style={{ fontSize: '10px' }}>▼</span>
                  </button>

                  {showExportMenu && (
                    <div style={{ position: 'absolute', right: 0, top: '110%', backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: '180px', overflow: 'hidden' }}>
                      <button
                        onClick={() => handleExport('csv')}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onMouseOver={(e) => e.target.style.backgroundColor = theme.subtleBg}
                        onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        📊 Excel (.CSV)
                      </button>

                      <button
                        onClick={() => handleExport('image')}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', cursor: 'pointer', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}
                        onMouseOver={(e) => e.target.style.backgroundColor = theme.subtleBg}
                        onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        🖼️ Imagen (.PNG)
                      </button>

                      <button
                        onClick={() => handleExport('print')}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', backgroundColor: 'transparent', color: theme.textPrimary, fontSize: '13px', cursor: 'pointer', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}
                        onMouseOver={(e) => e.target.style.backgroundColor = theme.subtleBg}
                        onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        🖨️ Imprimir / PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {filteredHistorial.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.textSecondary, fontSize: '14px' }}>
                  No se encontraron expedientes con los criterios seleccionados.
                </div>
              ) : (
                <div id="tabla-historial-export" style={{ overflowX: 'auto', backgroundColor: theme.cardBg, padding: '8px', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '12px' }}>Acreditado</th>
                        <th style={{ padding: '12px' }}>No. Crédito</th>
                        <th style={{ padding: '12px' }}>Fecha</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistorial.map((item, idx) => {
                        const dExtra = item.datos_extraidos || {};
                        const nombre = dExtra.acreditado || dExtra.nombre_acreditado || item.nombre_acreditado || 'N/A';
                        const numCred = dExtra.numero_credito || item.numero_credito || 'N/A';
                        
                        const parsed = parsearFechaExpediente(item);
                        const fechaStr = parsed ? parsed.fechaTexto : (item.created_at || item.fecha || 'Sin fecha');

                        return (
                          <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '12px', fontWeight: '600', color: theme.textPrimary }}>{nombre}</td>
                            <td style={{ padding: '12px', color: theme.textSecondary }}>{numCred}</td>
                            <td style={{ padding: '12px', color: theme.textSecondary }}>{fechaStr}</td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              <button
                                onClick={() => handleDownloadWord(item.id || item.expediente_id, dExtra)}
                                style={{ backgroundColor: theme.subtleBg, color: theme.textPrimary, border: `1px solid ${theme.border}`, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Download size={12} /> Descargar DOCX
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

              {/* TAB: USUARIOS (SOLO ADMIN) */}
          {activeTab === 'users' && esAdmin && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              {/* Formulario Crear Usuario */}
              <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={20} color={theme.accent} /> Crear Nuevo Usuario
                </h2>
                <form onSubmit={handleCrearUsuario}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Nombre de Usuario</label>
                    <input
                      type="text"
                      required
                      value={nuevoUsuario.username}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, username: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Contraseña</label>
                    <input
                      type="password"
                      required
                      value={nuevoUsuario.password}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="es_admin_cb"
                      checked={nuevoUsuario.es_admin}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, es_admin: e.target.checked, role: e.target.checked ? 'admin' : 'operador' })}
                    />
                    <label htmlFor="es_admin_cb" style={{ fontSize: '13px', color: theme.textPrimary, cursor: 'pointer' }}>Es Administrador</label>
                  </div>

                  <button
                    type="submit"
                    style={{ width: '100%', backgroundColor: theme.accent, color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                  >
                    Guardar Usuario
                  </button>
                </form>
              </div>

              {/* Lista de Usuarios */}
              <div style={{ backgroundColor: theme.cardBg, padding: '24px', borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={20} color={theme.accent} /> Lista de Usuarios
                </h2>

                {loadingUsuarios ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}`, color: theme.textSecondary }}>
                        <th style={{ padding: '10px' }}>Usuario</th>
                        <th style={{ padding: '10px' }}>Rol</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosLista.map((u) => {
                        const esUsuarioAdmin = u.es_admin || u.role === 'admin' || u.username === 'admin';
                        return (
                          <tr key={u.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '10px', fontWeight: '600', color: theme.textPrimary }}>{u.username}</td>
                            <td style={{ padding: '10px', color: theme.textSecondary }}>{esUsuarioAdmin ? 'Administrador' : 'Operador'}</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              {!esUsuarioAdmin ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleEliminarUsuario(e, u.id)}
                                  style={{ backgroundColor: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', padding: '6px' }}
                                  title="Eliminar usuario"
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', color: theme.textSecondary, fontStyle: 'italic' }}>Protegido</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

            </div>

          </main>
        </div>
      )}

      {/* MODAL DE CIERRE DE SESIÓN */}
      {showLogoutModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="slide-up" style={{ backgroundColor: theme.cardBg, padding: '32px', borderRadius: '16px', maxWidth: '400px', width: '100%', border: `1px solid ${theme.border}`, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', textAlign: 'center' }}>
            <div style={{ backgroundColor: isDarkMode ? '#450a0a' : '#fff1f2', width: '56px', height: '56px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <LogOut color="#dc2626" size={28} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: theme.textPrimary, fontSize: '20px', fontWeight: '700' }}>¿Cerrar sesión?</h3>
            <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '0 0 24px 0' }}>¿Está seguro que desea salir del sistema de cancelación de hipotecas?</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.subtleBg, color: theme.textPrimary, fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLogout}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
              >
                Sí, salir
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
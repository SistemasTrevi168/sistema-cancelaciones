import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { reportarError } from './ui/reportarError.js'

// Errores fuera de React (promesas, eventos): también se reportan
window.addEventListener('error', (e) => reportarError(e.error || e.message, 'window'))
window.addEventListener('unhandledrejection', (e) => reportarError(e.reason, 'promesa'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary nombre="app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

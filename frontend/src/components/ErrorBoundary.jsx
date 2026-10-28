import { Component } from 'react';

import { reportarError } from '../ui/reportarError';

// Si algo falla al dibujar una parte de la pantalla, en lugar de quedar todo en blanco se muestra un aviso
// con la opción de seguir. El error se manda al servidor (queda en el registro de Railway) para poder corregirlo.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportarError(error, `${this.props.nombre || 'app'} ${info?.componentStack?.split('\n').slice(0, 4).join(' ') || ''}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.silencioso) return null; // p. ej. el panel de notificaciones: se cierra y la app sigue
    return (
      <div className="error-pantalla" role="alert">
        <div>
          <h2>Algo no se mostró bien</h2>
          <p>No se perdió nada de lo guardado. Puedes intentar seguir o recargar la página.</p>
          <div className="error-pantalla-botones">
            <button type="button" onClick={() => this.setState({ error: null })}>Intentar seguir</button>
            <button type="button" className="principal" onClick={() => window.location.reload()}>Recargar</button>
          </div>
        </div>
      </div>
    );
  }
}

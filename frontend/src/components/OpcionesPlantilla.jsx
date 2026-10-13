import { GRUPOS_PLANTILLAS } from '../plantillasCatalogo';

// Opciones de los selectores de plantilla (una sola lista para todo el sistema)
export default function OpcionesPlantilla() {
  return GRUPOS_PLANTILLAS.map((g) => (
    <optgroup key={g.grupo} label={g.grupo}>
      {g.opciones.map(([valor, etiqueta]) => (
        <option key={valor} value={valor}>{etiqueta}</option>
      ))}
    </optgroup>
  ));
}

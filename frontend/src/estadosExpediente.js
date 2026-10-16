import { CheckCircle2, FileCheck2, PackageCheck } from 'lucide-react';

// Estados del expediente: Generado -> Revisado -> Entregado
export const ESTADOS = [
  { id: 'GENERADO', nombre: 'Generado', detalle: 'Ya tiene su Word', icono: FileCheck2, claro: ['#eef2ff', '#4338ca', '#c7d2fe'], oscuro: ['#1e1b4b', '#a5b4fc', '#3730a3'] },
  { id: 'REVISADO', nombre: 'Revisado', detalle: 'Se revisó y está correcto', icono: CheckCircle2, claro: ['#fffbeb', '#b45309', '#fde68a'], oscuro: ['#422006', '#fcd34d', '#854d0e'] },
  { id: 'ENTREGADO', nombre: 'Entregado', detalle: 'Ya se entregó', icono: PackageCheck, claro: ['#ecfdf5', '#047857', '#a7f3d0'], oscuro: ['#052e16', '#6ee7b7', '#166534'] },
];
export const infoEstado = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0];

export function colorEstado(id, isDarkMode) {
  const [fondo, texto, borde] = infoEstado(id)[isDarkMode ? 'oscuro' : 'claro'];
  return { backgroundColor: fondo, color: texto, borderColor: borde };
}

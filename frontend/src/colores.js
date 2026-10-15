// Color del sistema que cada usuario puede elegir en "Mi perfil"

export const COLOR_ACENTO_DEFECTO = '#2563eb';

export const COLORES_ACENTO = [
  { nombre: 'Azul', valor: '#2563eb' },
  { nombre: 'Índigo', valor: '#4f46e5' },
  { nombre: 'Violeta', valor: '#7c3aed' },
  { nombre: 'Rosa', valor: '#db2777' },
  { nombre: 'Rojo', valor: '#dc2626' },
  { nombre: 'Naranja', valor: '#c2410c' },
  { nombre: 'Verde', valor: '#15803d' },
  { nombre: 'Turquesa', valor: '#0f766e' },
  { nombre: 'Cian', valor: '#0e7490' },
  { nombre: 'Grafito', valor: '#334155' },
];

const aRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const aHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const luminancia = ([r, g, b]) => {
  const c = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrasteConBlanco = (hex) => {
  const rgb = aRgb(hex);
  return rgb ? 1.05 / (luminancia(rgb) + 0.05) : 1;
};

// Si el color es muy claro, se oscurece lo necesario para que el texto blanco encima se lea bien (4.5:1)
export function colorLegible(hex) {
  let rgb = aRgb(hex);
  if (!rgb) return COLOR_ACENTO_DEFECTO;
  for (let i = 0; i < 40 && 1.05 / (luminancia(rgb) + 0.05) < 4.5; i += 1) {
    rgb = rgb.map((v) => v * 0.93);
  }
  return aHex(rgb);
}

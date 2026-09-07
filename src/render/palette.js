// Snake colours (balanced lightness/saturation, ten hues) and canvas theme colours.

const BASE = ['#F0625A', '#EE8A3C', '#D9A930', '#A3B833', '#5BC06A', '#2FBFA7', '#3BB0E0', '#6B8CF5', '#A57CF2', '#E86FB0'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
export function shade(hex, dl, ds = 0) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(...hslToRgb([h, Math.max(0, Math.min(1, s + ds)), Math.max(0, Math.min(1, l + dl))]));
}

export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

export function colorSets(theme) {
  const dark = theme === 'dark';
  return BASE.map((hex) => {
    const base = dark ? shade(hex, 0.02, 0.02) : hex;
    return {
      base,
      dark: shade(base, -0.18, 0.02),
      light: shade(base, 0.22, -0.05),
      deep: shade(base, -0.32, 0),
    };
  });
}

export const THEMES = {
  light: {
    bg: '#F3EBDC',
    board: '#FAF5EA',
    boardStroke: 'rgba(95, 75, 45, 0.14)',
    boardShadow: 'rgba(95, 75, 45, 0.16)',
    grid: 'rgba(95, 75, 45, 0.09)',
    snakeShadow: 'rgba(70, 45, 20, 0.22)',
    eye: '#FFFFFF',
    pupil: '#2B2530',
    warn: '#E5484D',
    tongue: '#E0475C',
    rock: '#C4B5A0',
    rockDark: '#8F8070',
    rockLight: '#E6DCCB',
  },
  dark: {
    bg: '#191C25',
    board: '#232836',
    boardStroke: 'rgba(255, 255, 255, 0.08)',
    boardShadow: 'rgba(0, 0, 0, 0.45)',
    grid: 'rgba(255, 255, 255, 0.06)',
    snakeShadow: 'rgba(0, 0, 0, 0.45)',
    eye: '#F6F3EC',
    pupil: '#1C1A22',
    warn: '#FF6B6B',
    tongue: '#FF5C74',
    rock: '#4A5163',
    rockDark: '#2C3140',
    rockLight: '#697187',
  },
};

// Assign palette indices so touching snakes never share a color and colors stay balanced.

import { buildOccupancy, cellIndex } from './level.js';

export const PALETTE_SIZE = 10;

export function assignColors(level, rng, size = PALETTE_SIZE) {
  const occ = buildOccupancy(level);
  const n = level.snakes.length;
  const neighbors = Array.from({ length: n }, () => new Set());
  const around = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  level.snakes.forEach((s, i) => {
    for (const [x, y] of s.cells) {
      for (const [dx, dy] of around) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue;
        const o = occ[cellIndex(level, nx, ny)];
        if (o >= 0 && o !== i) neighbors[i].add(o);
      }
    }
  });
  const counts = new Array(size).fill(0);
  const colors = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const used = new Set();
    for (const j of neighbors[i]) if (colors[j] >= 0) used.add(colors[j]);
    let allowed = [];
    for (let c = 0; c < size; c++) if (!used.has(c)) allowed.push(c);
    if (allowed.length === 0) allowed = Array.from({ length: size }, (_, c) => c);
    const weights = allowed.map((c) => 1 / (1 + counts[c] * counts[c]));
    const c = allowed[rng.weighted(weights)];
    colors[i] = c;
    counts[c]++;
    level.snakes[i].color = c;
  }
  return colors;
}

// Movement simulation.
//
// Ticks are integer cell steps. When a snake with L segments starts moving at tick 0,
// segment i (0 = head) at tick T is at:
//   cells[i - T]            if i >= T   (still on the original body path)
//   head + d * (T - i)      otherwise   (out on the ray, possibly beyond the board)
// The tail leaves the board at tick L + R where R = ray length.

import { headDir, rayCells, cellIndex, ROCK } from './level.js';

// Static check against an occupancy map of *idle* snakes (occ[cell] = snake index or -1).
export function checkExitStatic(level, i, occ) {
  const snake = level.snakes[i];
  const L = snake.cells.length;
  const ray = rayCells(level, snake);
  for (let t = 1; t <= ray.length; t++) {
    const [x, y] = ray[t - 1];
    const o = occ[cellIndex(level, x, y)];
    if (o === -1) continue;
    if (o === ROCK) return { ok: false, blockedBy: ROCK, rock: true, self: false, at: [x, y], dist: t, ray };
    if (o !== i) return { ok: false, blockedBy: o, self: false, at: [x, y], dist: t, ray };
    // The ray crosses our own body. Body cell j is vacated at tick L - j (segment j+T sits on it at tick T).
    const j = snake.cells.findIndex((c) => c[0] === x && c[1] === y);
    if (j + t < L) return { ok: false, blockedBy: i, self: true, at: [x, y], dist: t, ray };
  }
  return { ok: true, ray, L, R: ray.length, ticks: L + ray.length };
}

export function snakeCellsAtTick(snake, T) {
  const [dx, dy] = headDir(snake);
  const [hx, hy] = snake.cells[0];
  const L = snake.cells.length;
  const out = new Array(L);
  for (let i = 0; i < L; i++) {
    if (i >= T) out[i] = snake.cells[i - T];
    else {
      const k = T - i;
      out[i] = [hx + dx * k, hy + dy * k];
    }
  }
  return out;
}

// For each tick 0..L+R, the set of in-bounds cell indices occupied by the moving snake.
export function exitTimeline(level, i) {
  const snake = level.snakes[i];
  const L = snake.cells.length;
  const R = rayCells(level, snake).length;
  const timeline = [];
  for (let T = 0; T <= L + R; T++) {
    const set = new Set();
    for (const [x, y] of snakeCellsAtTick(snake, T)) {
      if (x >= 0 && y >= 0 && x < level.w && y < level.h) set.add(cellIndex(level, x, y));
    }
    timeline.push(set);
  }
  return timeline;
}

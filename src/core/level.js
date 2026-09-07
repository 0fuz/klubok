// Level data model and geometry helpers.
//
// level = { w, h, snakes: [{ id, color, cells: [[x,y], ...] }] }
// cells are ordered head first. Head direction = cells[0] - cells[1].
// A tapped snake moves head-first in its head direction in a straight line
// until it leaves the board; the body follows the head along its own path.

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up
export const DIR_CHARS = ['>', 'v', '<', '^'];
export const ROCK = -2; // occupancy value of an immovable rock cell

export function inBounds(level, x, y) {
  return x >= 0 && y >= 0 && x < level.w && y < level.h;
}

export function cellIndex(level, x, y) {
  return y * level.w + x;
}

export function headDir(snake) {
  const [hx, hy] = snake.cells[0];
  const [bx, by] = snake.cells[1];
  return [Math.sign(hx - bx), Math.sign(hy - by)];
}

export function dirIndex(d) {
  return DIRS.findIndex((v) => v[0] === d[0] && v[1] === d[1]);
}

// Cells the head will pass through, from the cell right in front of the head to the board edge.
// ray[t-1] is the cell the head occupies at tick t.
export function rayCells(level, snake) {
  const [dx, dy] = headDir(snake);
  let [x, y] = snake.cells[0];
  const out = [];
  for (;;) {
    x += dx;
    y += dy;
    if (!inBounds(level, x, y)) break;
    out.push([x, y]);
  }
  return out;
}

export function buildOccupancy(level) {
  const occ = new Int32Array(level.w * level.h).fill(-1);
  if (level.rocks) for (const [x, y] of level.rocks) occ[cellIndex(level, x, y)] = ROCK;
  level.snakes.forEach((s, i) => {
    for (const [x, y] of s.cells) occ[cellIndex(level, x, y)] = i;
  });
  return occ;
}

export function snakeBBox(snake) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of snake.cells) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

// Structural validation. Returns a list of human readable problems (empty = valid).
export function validateLevel(level) {
  const errors = [];
  if (!level || typeof level !== 'object') return ['level is not an object'];
  if (!(Number.isInteger(level.w) && level.w >= 2)) errors.push('w must be an integer >= 2');
  if (!(Number.isInteger(level.h) && level.h >= 2)) errors.push('h must be an integer >= 2');
  if (!Array.isArray(level.snakes)) return [...errors, 'snakes must be an array'];
  const seen = new Map();
  if (level.rocks !== undefined) {
    if (!Array.isArray(level.rocks)) errors.push('rocks must be an array');
    else level.rocks.forEach(([x, y], k) => {
      if (!inBounds(level, x, y)) errors.push(`rock ${k} (${x},${y}) out of bounds`);
      const key = `${x},${y}`;
      if (seen.has(key)) errors.push(`rock ${k}: duplicate ${key}`);
      seen.set(key, 'rock');
    });
  }
  level.snakes.forEach((s, i) => {
    if (!s || !Array.isArray(s.cells)) {
      errors.push(`snake ${i}: cells missing`);
      return;
    }
    if (s.cells.length < 2) errors.push(`snake ${i}: length ${s.cells.length} < 2`);
    const own = new Set();
    s.cells.forEach(([x, y], k) => {
      if (!Number.isInteger(x) || !Number.isInteger(y)) errors.push(`snake ${i}: cell ${k} not integer`);
      if (!inBounds(level, x, y)) errors.push(`snake ${i}: cell ${k} (${x},${y}) out of bounds`);
      const key = `${x},${y}`;
      if (own.has(key)) errors.push(`snake ${i}: duplicate cell ${key}`);
      own.add(key);
      if (seen.has(key)) errors.push(`snake ${i}: cell ${key} overlaps snake ${seen.get(key)}`);
      seen.set(key, i);
      if (k > 0) {
        const [px, py] = s.cells[k - 1];
        if (Math.abs(px - x) + Math.abs(py - y) !== 1) errors.push(`snake ${i}: cells ${k - 1} and ${k} not adjacent`);
      }
    });
  });
  return errors;
}

export function levelToAscii(level) {
  const occ = buildOccupancy(level);
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const heads = new Map();
  level.snakes.forEach((s, i) => {
    const d = dirIndex(headDir(s));
    heads.set(cellIndex(level, s.cells[0][0], s.cells[0][1]), DIR_CHARS[d] || '?');
  });
  const rows = [];
  for (let y = 0; y < level.h; y++) {
    let row = '';
    for (let x = 0; x < level.w; x++) {
      const k = cellIndex(level, x, y);
      const i = occ[k];
      if (i === ROCK) row += '#';
      else if (i < 0) row += '.';
      else if (heads.has(k)) row += heads.get(k);
      else row += letters[i % letters.length];
    }
    rows.push(row);
  }
  return rows.join('\n');
}

// Procedural level generation with an explicit exit-order graph.
//
// Snakes are added one at a time. Each new snake picks a head cell and a direction; the
// straight ray from the head to the edge may pass through free cells and (on higher
// levels) through bodies of already placed snakes. Every crossing adds an ordering
// constraint: "that snake exits before this one". A body cell lying on someone else's
// ray adds the opposite constraint: "this one exits before that one". The constraints
// are kept acyclic while placing, so every generated level is solvable by construction
// (the solver only has to find a topological order).
//
// A body may cross its own ray only where the tail will have moved out of the way by the
// time the head arrives (body index j on ray distance t is safe iff j + t >= L).

import { Rng, mix } from './rng.js';
import { DIRS, ROCK } from './level.js';
import { hardness } from './solver.js';
import { assignColors } from './colors.js';
import { paramsForLevel } from './difficulty.js';

export const DEFAULT_SEED = 0x5eed1234;
export const EXHAUSTED = Symbol('exhausted');

class Ctx {
  constructor(p) {
    this.p = p;
    this.w = p.w;
    this.h = p.h;
    const N = p.w * p.h;
    this.occ = new Int32Array(N).fill(-1);
    this.rayOwners = new Array(N); // cell -> [snake ids whose ray passes here]
    this.snakes = [];
    this.after = []; // after[i] = Set of j with "i exits before j"
    this.prev = []; // prev[j] = Set of i with "i exits before j"
    // anc[k]: bitset of every snake that must exit before k (transitive), kept incrementally.
    this.words = Math.ceil((N / 2 + 2) / 32);
    this.anc = [];
    this.rocks = [];
    this.edgeHeads = 0; // snakes with a zero-length ray (sitting at an exit)
  }
  free(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.occ[y * this.w + x] === -1;
  }
  addNode() {
    this.after.push(new Set());
    this.prev.push(new Set());
    this.anc.push(new Uint32Array(this.words));
  }
  addEdge(i, j) {
    if (i === j) throw new Error('self edge');
    this.after[i].add(j);
    this.prev[j].add(i);
    // Every descendant of j inherits anc[i] + {i}. Descendants already contain the
    // ancestors of their parents, so a node that does not change can stop the walk.
    const M = this.anc[i];
    const wi = i >> 5, bit = 1 << (i & 31);
    const visited = new Uint8Array(this.anc.length);
    const stack = [j];
    while (stack.length) {
      const n = stack.pop();
      if (visited[n]) continue;
      visited[n] = 1;
      const a = this.anc[n];
      let changed = false;
      for (let w = 0; w < a.length; w++) {
        const v = a[w] | M[w];
        if (v !== a[w]) { a[w] = v; changed = true; }
      }
      if ((a[wi] & bit) === 0) { a[wi] |= bit; changed = true; }
      if (changed) for (const d of this.after[n]) stack.push(d);
    }
  }
  // Bitset of all nodes that must exit before any node of `targets` (targets included).
  ancestors(targets) {
    const mask = new Uint32Array(this.words);
    for (const i of targets) {
      const a = this.anc[i];
      for (let w = 0; w < a.length; w++) mask[w] |= a[w];
      mask[i >> 5] |= 1 << (i & 31);
    }
    return mask;
  }
  static has(mask, o) {
    return (mask[o >> 5] >>> (o & 31)) & 1;
  }
  ownersOf(k) {
    return this.rayOwners[k] || null;
  }
}

function occupiedAround(ctx, x, y) {
  let n = 0;
  if (!ctx.free(x + 1, y)) n++;
  if (!ctx.free(x - 1, y)) n++;
  if (!ctx.free(x, y + 1)) n++;
  if (!ctx.free(x, y - 1)) n++;
  return n;
}

// Can (x,y) be a head? Needs a direction whose ray reaches the edge crossing at most
// p.rayCross other snakes, and a free cell behind the head.
function tryHead(rng, ctx, x, y, rayCross, rayMax = ctx.p.rayMax, preferFewCrossings = 0.6) {
  const { w, h, p, occ } = ctx;
  if (!ctx.free(x, y)) return null;
  const options = [];
  for (const di of rng.shuffle([0, 1, 2, 3])) {
    const d = DIRS[di];
    const crossed = new Set();
    let r = 0, cx = x + d[0], cy = y + d[1], blocked = false;
    while (cx >= 0 && cy >= 0 && cx < w && cy < h) {
      const o = occ[cy * w + cx];
      if (o === ROCK) { blocked = true; break; }
      if (o !== -1) crossed.add(o);
      r++; cx += d[0]; cy += d[1];
    }
    if (blocked || r > rayMax || crossed.size > rayCross) continue;
    if (r === 0 && ctx.edgeHeads >= p.edgeQuota) continue;
    if (!ctx.free(x - d[0], y - d[1])) continue;
    // The head and the cell behind it are body cells too: they must not sit on a ray
    // of any snake that has to exit after us (that would close a cycle).
    const forbidden = ctx.ancestors([...crossed]);
    const k0 = y * w + x, k1 = (y - d[1]) * w + (x - d[0]);
    let bad = false;
    for (const k of [k0, k1]) {
      const owners = ctx.ownersOf(k);
      if (owners) for (const o of owners) if (Ctx.has(forbidden, o)) { bad = true; break; }
      if (bad) break;
    }
    if (bad) continue;
    options.push({ d, R: r, crossed, forbidden });
  }
  if (!options.length) return null;
  // Fewer crossings = smaller forbidden set = the body has room to grow.
  if (options.length > 1 && rng.chance(preferFewCrossings)) options.sort((a, b) => a.crossed.size - b.crossed.size);
  return options[0];
}

// Random head with a bias towards the centre: central snakes get long rays that later
// snakes cover, which is where the deep dependency chains come from.
function placeSnake(rng, ctx) {
  const { w, h, p } = ctx;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  const samples = [];
  for (let k = 0; k < 40; k++) {
    const x = rng.int(w), y = rng.int(h);
    const key = p.centerBias * (Math.hypot(x - cx, y - cy) / maxD) + (1 - p.centerBias) * rng.next();
    samples.push([key, x, y]);
  }
  samples.sort((u, v) => u[0] - v[0]);
  for (const [, x, y] of samples) {
    const found = tryHead(rng, ctx, x, y, p.rayCross);
    if (found) return placeAt(rng, ctx, x, y, found, p.lenMin, p.lenMax, Math.max(2, Math.floor(p.lenMin * 0.6)));
  }
  const N = w * h, start = rng.int(N);
  for (let k = 0; k < N; k++) {
    const c = (start + k) % N;
    const x = c % w, y = (c - x) / w;
    const found = tryHead(rng, ctx, x, y, p.rayCross);
    if (found) return placeAt(rng, ctx, x, y, found, p.lenMin, p.lenMax, Math.max(2, Math.floor(p.lenMin * 0.6)));
  }
  return EXHAUSTED;
}

function placeAt(rng, ctx, hx, hy, found, lenMin, lenMax, minAccept) {
  const { w, h, p } = ctx;
  const id = ctx.snakes.length;
  const { d, R, crossed, forbidden } = found;
  const ix = -d[0], iy = -d[1];

  const rayDist = new Map();
  for (let t = 1; t <= R; t++) rayDist.set((hy + d[1] * t) * w + (hx + d[0] * t), t);

  const Lt = rng.range(lenMin, lenMax);
  const cells = [[hx, hy], [hx + ix, hy + iy]];
  const own = new Set([hy * w + hx, (hy + iy) * w + (hx + ix)]);
  let dir = [ix, iy];
  let cur = cells[1];
  let selfCross = false;

  while (cells.length < Lt) {
    const cands = [];
    const weights = [];
    for (const nd of DIRS) {
      if (nd[0] === -dir[0] && nd[1] === -dir[1]) continue;
      const nx = cur[0] + nd[0], ny = cur[1] + nd[1];
      if (!ctx.free(nx, ny)) continue;
      const k = ny * w + nx;
      if (own.has(k)) continue;
      const rt = rayDist.get(k);
      if (rt !== undefined && cells.length + rt < Lt) continue;
      const owners = ctx.ownersOf(k);
      let bad = false;
      if (owners) for (const o of owners) if (Ctx.has(forbidden, o)) { bad = true; break; }
      if (bad) continue;
      const straight = nd[0] === dir[0] && nd[1] === dir[1];
      let wgt = straight ? 1 - p.turn : p.turn / 2;
      if (owners && owners.length) wgt *= 1 + 3 * p.crossBias;
      wgt *= 1 + 0.5 * occupiedAround(ctx, nx, ny);
      cands.push([nd, nx, ny, k, rt !== undefined]);
      weights.push(wgt);
    }
    if (!cands.length) break;
    const c = cands[rng.weighted(weights)];
    cells.push([c[1], c[2]]);
    own.add(c[3]);
    if (c[4]) selfCross = true;
    dir = c[0];
    cur = cells[cells.length - 1];
  }
  if (cells.length < minAccept) return null;

  // Commit.
  ctx.addNode();
  const snake = { id, color: 0, cells, selfCross, limit: selfCross ? cells.length : lenMax };
  ctx.snakes.push(snake);
  if (R === 0) ctx.edgeHeads++;
  for (const k of own) {
    ctx.occ[k] = id;
    const owners = ctx.ownersOf(k);
    if (owners) for (const j of owners) ctx.addEdge(id, j);
  }
  for (const k of rayDist.keys()) (ctx.rayOwners[k] || (ctx.rayOwners[k] = [])).push(id);
  for (const i of crossed) ctx.addEdge(i, id);
  return snake;
}

// Grow tails into free pockets. A cell is safe when no ray owner there could be forced
// into a cycle (owner must not already exit before us) and it is not on our own ray.
function extendTails(rng, ctx, limitFactor = 1) {
  const { w, snakes } = ctx;
  let progress = false;
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of rng.shuffle(snakes.map((_, i) => i))) {
      const snake = snakes[s];
      const limit = snake.selfCross ? snake.limit : Math.round(snake.limit * limitFactor);
      if (snake.cells.length >= limit) continue;
      const [tx, ty] = snake.cells[snake.cells.length - 1];
      const anc = ctx.ancestors([s]);
      const opts = [];
      for (const d of DIRS) {
        const nx = tx + d[0], ny = ty + d[1];
        if (!ctx.free(nx, ny)) continue;
        const k = ny * w + nx;
        const owners = ctx.ownersOf(k);
        let bad = false;
        if (owners) for (const o of owners) if (Ctx.has(anc, o)) { bad = true; break; }
        if (!bad) opts.push([nx, ny, k]);
      }
      if (!opts.length) continue;
      const c = rng.pick(opts);
      snake.cells.push([c[0], c[1]]);
      ctx.occ[c[2]] = s;
      const owners = ctx.ownersOf(c[2]);
      if (owners) for (const j of owners) if (j !== s) ctx.addEdge(s, j);
      grew = true;
      progress = true;
    }
  }
  return progress;
}

// Grow heads forward by one cell into a free cell. The ray gets shorter (fewer
// dependencies), the new head cell must not belong to a ray of someone who already exits
// before us. Skipped for snakes whose body crosses their own ray (indices would shift).
function extendHeads(rng, ctx, limitFactor = 1) {
  const { w, snakes } = ctx;
  let progress = false;
  for (const s of rng.shuffle(snakes.map((_, i) => i))) {
    const snake = snakes[s];
    if (snake.selfCross) continue;
    if (snake.cells.length >= Math.round(snake.limit * limitFactor)) continue;
    const [hx, hy] = snake.cells[0];
    const [bx, by] = snake.cells[1];
    const dx = hx - bx, dy = hy - by;
    const nx = hx + dx, ny = hy + dy;
    if (!ctx.free(nx, ny)) continue;
    // stepping onto the exit cell turns this into a free snake: respect the quota
    const ax = nx + dx, ay = ny + dy;
    const atExit = ax < 0 || ay < 0 || ax >= w || ay >= ctx.h || ctx.occ[ay * w + ax] === ROCK;
    if (atExit && ctx.edgeHeads >= ctx.p.edgeQuota) continue;
    const k = ny * w + nx;
    const owners = ctx.ownersOf(k);
    const anc = ctx.ancestors([s]);
    let bad = false;
    if (owners) for (const o of owners) if (o !== s && Ctx.has(anc, o)) { bad = true; break; }
    if (bad) continue;
    snake.cells.unshift([nx, ny]);
    ctx.occ[k] = s;
    if (atExit) ctx.edgeHeads++;
    if (owners) for (const j of owners) if (j !== s) ctx.addEdge(s, j);
    progress = true;
  }
  return progress;
}

// Put new snakes into leftover free cells, allowing rays through any number of bodies.
function fillPockets(rng, ctx, rayCross) {
  const { w, h, p } = ctx;
  let progress = false;
  const N = w * h;
  const order = [];
  for (let k = 0; k < N; k++) if (ctx.occ[k] === -1) order.push(k);
  rng.shuffle(order);
  for (const k of order) {
    if (ctx.occ[k] !== -1) continue;
    const x = k % w, y = (k - x) / w;
    const found = tryHead(rng, ctx, x, y, rayCross, Infinity, 1);
    if (!found) continue;
    const s = placeAt(rng, ctx, x, y, found, 2, p.lenMax, 2);
    if (s && s !== EXHAUSTED) progress = true;
  }
  return progress;
}

function rayFrom(ctx, x, y, dx, dy) {
  const { w, h, occ } = ctx;
  const crossed = new Set();
  const cells = [];
  let cx = x + dx, cy = y + dy;
  while (cx >= 0 && cy >= 0 && cx < w && cy < h) {
    const k = cy * w + cx;
    const o = occ[k];
    if (o === ROCK) return { crossed, cells, blocked: true };
    if (o !== -1) crossed.add(o);
    cells.push(k);
    cx += dx; cy += dy;
  }
  return { crossed, cells, blocked: false };
}

// Single free cells nobody can grow into: a neighbouring snake donates its tail part,
// which together with the free cell becomes a new snake (either end may be the head).
function annexSingles(rng, ctx, rayCross) {
  const { w, h, p, snakes, occ } = ctx;
  let progress = false;
  const free = [];
  for (let k = 0; k < w * h; k++) if (occ[k] === -1) free.push(k);
  rng.shuffle(free);
  for (const k of free) {
    if (occ[k] !== -1) continue;
    const x = k % w, y = (k - x) / w;
    let done = false;
    for (const d of rng.shuffle([0, 1, 2, 3]).map((i) => DIRS[i])) {
      const nx = x + d[0], ny = y + d[1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const sIdx = occ[ny * w + nx];
      if (sIdx < 0) continue;
      const S = snakes[sIdx];
      // Cutting a self-crossing snake is safe: a shorter body only relaxes j + t >= L.
      const j = S.cells.findIndex((c) => c[0] === nx && c[1] === ny);
      if (j < 2) continue;
      const tailPart = S.cells.slice(j);
      const options = [[[x, y], ...tailPart], [...tailPart].reverse().concat([[x, y]])];
      for (const T of options) {
        const hd = [T[0][0] - T[1][0], T[0][1] - T[1][1]];
        const ray = rayFrom(ctx, T[0][0], T[0][1], hd[0], hd[1]);
        if (ray.blocked || ray.crossed.size > rayCross) continue;
        if (ray.cells.length === 0 && ctx.edgeHeads >= p.edgeQuota) continue;
        const ownSet = new Set(T.map((c) => c[1] * w + c[0]));
        if (ray.cells.some((c) => ownSet.has(c))) continue;
        const forbidden = ctx.ancestors([...ray.crossed]);
        let bad = false;
        for (const c of T) {
          const owners = ctx.ownersOf(c[1] * w + c[0]);
          if (owners) for (const o of owners) if (Ctx.has(forbidden, o)) { bad = true; break; }
          if (bad) break;
        }
        if (bad) continue;
        const tId = snakes.length;
        ctx.addNode();
        S.cells = S.cells.slice(0, j);
        snakes.push({ id: tId, color: 0, cells: T, selfCross: false, limit: p.lenMax });
        for (const c of T) {
          const kk = c[1] * w + c[0];
          occ[kk] = tId;
          const owners = ctx.ownersOf(kk);
          if (owners) for (const o of owners) if (o !== tId) ctx.addEdge(tId, o);
        }
        for (const kk of ray.cells) (ctx.rayOwners[kk] || (ctx.rayOwners[kk] = [])).push(tId);
        for (const i of ray.crossed) ctx.addEdge(i, tId);
        if (ray.cells.length === 0) ctx.edgeHeads++;
        progress = true;
        done = true;
        break;
      }
      if (done) break;
    }
  }
  return progress;
}

// Turn a snake around: the tail becomes the head. Valid when the new ray reaches an exit
// without touching the snake itself and the new ordering constraints stay acyclic.
function flipSnake(ctx, sIdx) {
  const { w, p, snakes } = ctx;
  const S = snakes[sIdx];
  const cells = S.cells;
  const L = cells.length;
  const nh = cells[L - 1], nb = cells[L - 2];
  const d = [nh[0] - nb[0], nh[1] - nb[1]];
  const ray = rayFrom(ctx, nh[0], nh[1], d[0], d[1]);
  if (ray.blocked) return false;
  if (ray.cells.length === 0 && ctx.edgeHeads >= p.edgeQuota) return false;
  const own = new Set(cells.map((c) => c[1] * w + c[0]));
  if (ray.cells.some((k) => own.has(k))) return false;
  const forbidden = ctx.ancestors([...ray.crossed]);
  for (const c of cells) {
    const owners = ctx.ownersOf(c[1] * w + c[0]);
    if (owners) for (const o of owners) if (o !== sIdx && Ctx.has(forbidden, o)) return false;
  }
  // drop the old ray ownership, install the new one
  const oh = cells[0], ob = cells[1];
  const oldRay = rayFrom(ctx, oh[0], oh[1], oh[0] - ob[0], oh[1] - ob[1]);
  for (const k of oldRay.cells) {
    const owners = ctx.rayOwners[k];
    if (owners) { const i = owners.indexOf(sIdx); if (i >= 0) owners.splice(i, 1); }
  }
  if (oldRay.cells.length === 0) ctx.edgeHeads--;
  if (ray.cells.length === 0) ctx.edgeHeads++;
  S.cells = cells.slice().reverse();
  S.selfCross = false;
  S.limit = p.lenMax;
  for (const k of ray.cells) (ctx.rayOwners[k] || (ctx.rayOwners[k] = [])).push(sIdx);
  for (const i of ray.crossed) ctx.addEdge(i, sIdx);
  return true;
}

function isFree(ctx, sIdx) {
  const S = ctx.snakes[sIdx];
  const h = S.cells[0], b = S.cells[1];
  const ray = rayFrom(ctx, h[0], h[1], h[0] - b[0], h[1] - b[1]);
  return !ray.blocked && ray.crossed.size === 0;
}

// Bring the number of initially free snakes down to `target` by turning free snakes
// around so they face into the crowd.
function lockFree(rng, ctx, target) {
  const free = [];
  for (let i = 0; i < ctx.snakes.length; i++) if (isFree(ctx, i)) free.push(i);
  let count = free.length;
  let progress = false;
  for (const i of rng.shuffle(free)) {
    if (count <= target) break;
    if (ctx.snakes[i].cells.length < 2) continue;
    if (flipSnake(ctx, i) && !isFree(ctx, i)) { count--; progress = true; }
  }
  return progress;
}

// Fill-up stage: alternate pocket snakes, tail growth and head growth until nothing moves.
function perfect(rng, ctx) {
  const { p } = ctx;
  const rayCross = p.pocketRayCross;
  for (let round = 0; round < 8; round++) {
    let progress = false;
    if (fillPockets(rng, ctx, rayCross)) progress = true;
    if (extendTails(rng, ctx, 1.5)) progress = true;
    if (extendHeads(rng, ctx, 1.5)) progress = true;
    if (annexSingles(rng, ctx, rayCross)) progress = true;
    if (!progress) break;
  }
}

// Random runs of 1s covering about `fraction` of `len`, never where `forbidden` is set.
function runMask(rng, len, fraction, forbidden) {
  const mask = new Uint8Array(len);
  const want = Math.round(len * fraction);
  let count = 0, guard = 0;
  while (count < want && guard++ < 300) {
    const run = rng.range(2, 8);
    const start = rng.int(len);
    for (let k = 0; k < run && count < want; k++) {
      const i = start + k;
      if (i >= len || mask[i] || (forbidden && forbidden[i])) continue;
      mask[i] = 1;
      count++;
    }
  }
  return mask;
}

// Rocks: walls along the border with gaps (the exits), plus scattered boulders inside.
// Every row keeps an open end on at least one side and every column at least one open
// end, so each cell always has a possible exit direction; the walls only decide which.
function placeRocks(rng, ctx) {
  const { w, h, p, occ } = ctx;
  const put = (x, y) => {
    const k = y * w + x;
    if (occ[k] !== -1) return;
    occ[k] = ROCK;
    ctx.rocks.push([x, y]);
  };
  if (p.rockBorder > 0) {
    // Up to 0.5: rows and columns lose one of their two exits.
    // Beyond 0.5: the lines along the longer axis start losing both exits, while every
    // line along the shorter axis keeps exactly one, so the whole board stays reachable.
    const f = Math.min(0.5, p.rockBorder);
    const closeBoth = Math.max(0, (p.rockBorder - 0.5) * 2);
    const rowsKeep = w >= h; // exits stay on the left/right for wide boards
    const sideRows = (len, keepOne) => {
      const a = runMask(rng, len, keepOne ? Math.max(f, 0.5 * Math.min(1, closeBoth * 4 + f * 2)) : f, null);
      const b = runMask(rng, len, keepOne ? Math.max(f, 0.5 * Math.min(1, closeBoth * 4 + f * 2)) : f, a);
      if (!keepOne && closeBoth > 0) {
        for (let i = 0; i < len; i++) if (rng.chance(closeBoth)) { a[i] = 1; b[i] = 1; }
      }
      return [a, b];
    };
    if (h > 2) {
      const [left, right] = sideRows(h - 2, rowsKeep);
      for (let i = 0; i < h - 2; i++) {
        if (left[i]) put(0, i + 1);
        if (right[i]) put(w - 1, i + 1);
      }
    }
    if (w > 2) {
      const [top, bottom] = sideRows(w - 2, !rowsKeep);
      for (let i = 0; i < w - 2; i++) {
        if (top[i]) put(i + 1, 0);
        if (bottom[i]) put(i + 1, h - 1);
      }
    }
    if (p.rockBorder >= 0.12) for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) put(x, y);
  }
  if (p.rockInner > 0 && w > 4 && h > 4) {
    const want = Math.round(p.rockInner * (w - 2) * (h - 2));
    let placed = 0, guard = 0;
    while (placed < want && guard++ < want * 6) {
      const x = 1 + rng.int(w - 2), y = 1 + rng.int(h - 2);
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (occ[ny * w + nx] === ROCK) { near = true; break; }
      }
      if (near) continue;
      put(x, y);
      placed++;
    }
  }
}

export function generateCandidate(rng, p) {
  const ctx = new Ctx(p);
  placeRocks(rng, ctx);
  const N = p.w * p.h - ctx.rocks.length;
  const target = Math.floor(p.fill * N);
  let occupied = 0;
  let fails = 0;
  while (occupied < target && fails < p.maxFails) {
    const s = placeSnake(rng, ctx);
    if (s === EXHAUSTED) break;
    if (!s) { fails++; continue; }
    fails = 0;
    occupied += s.cells.length;
  }
  if (ctx.snakes.length === 0) return null;
  perfect(rng, ctx);
  const targetFree = p.targetFree ?? Math.max(3, Math.round(ctx.snakes.length * p.freeFrac));
  for (let round = 0; round < 3; round++) {
    if (!lockFree(rng, ctx, targetFree)) break;
    perfect(rng, ctx);
  }
  const snakes = ctx.snakes.map((s) => ({ id: s.id, color: 0, cells: s.cells }));
  return { w: p.w, h: p.h, rocks: ctx.rocks, snakes };
}

// Generate the level for a given level number. Deterministic for (levelNumber, aspect, baseSeed).
export function generateLevel(levelNumber, aspect = 1, baseSeed = DEFAULT_SEED) {
  const p = paramsForLevel(levelNumber, aspect);
  const seed = mix(baseSeed, levelNumber);
  let best = null;
  for (let c = 0; c < p.candidates; c++) {
    const lvl = generateCandidate(new Rng(mix(seed, c + 1)), p);
    if (!lvl) continue;
    const h = hardness(lvl);
    if (!h.solvable) continue;
    const n = lvl.snakes.length;
    const targetFree = p.targetFree ?? Math.max(3, Math.round(n * p.freeFrac));
    const free0 = h.steps[0].free;
    const dist = Math.abs(h.value - p.targetHardness) + 0.6 * Math.abs(free0 - targetFree) / Math.max(4, targetFree);
    if (!best || dist < best.dist) best = { lvl, dist, h: h.value };
  }
  if (!best) throw new Error(`generation failed for level ${levelNumber}`);
  const lvl = best.lvl;
  lvl.level = levelNumber;
  lvl.seed = seed;
  lvl.hardness = best.h;
  lvl.params = p;
  assignColors(lvl, new Rng(mix(seed, 777)));
  return lvl;
}

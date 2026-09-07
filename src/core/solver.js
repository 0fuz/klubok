// Dependency analysis. Because snakes only move when tapped and always exit in a straight
// line, "A is blocked by B" is a static relation: B has a cell on A's ray. The level is
// solvable iff that graph is acyclic and no snake is blocked by itself.

import { buildOccupancy, rayCells, cellIndex, ROCK } from './level.js';

export function buildDeps(level) {
  const occ = buildOccupancy(level);
  const n = level.snakes.length;
  const blockers = Array.from({ length: n }, () => new Set());
  const selfBlocked = new Array(n).fill(false); // permanently blocked: own body or a rock
  const farBlock = new Array(n).fill(false); // nearest blocker is not adjacent to the head
  level.snakes.forEach((s, i) => {
    const ray = rayCells(level, s);
    const L = s.cells.length;
    let nearest = Infinity;
    for (let t = 1; t <= ray.length; t++) {
      const [x, y] = ray[t - 1];
      const o = occ[cellIndex(level, x, y)];
      if (o === -1) continue;
      if (o === ROCK) { selfBlocked[i] = true; if (t < nearest) nearest = t; continue; }
      if (o !== i) {
        blockers[i].add(o);
        if (t < nearest) nearest = t;
      } else {
        const j = s.cells.findIndex((c) => c[0] === x && c[1] === y);
        if (j + t < L) {
          selfBlocked[i] = true;
          if (t < nearest) nearest = t;
        }
      }
    }
    farBlock[i] = nearest !== Infinity && nearest >= 3;
  });
  return { blockers, selfBlocked, farBlock };
}

// Greedy solve (always removes the lowest-index free snake). Any topological order works,
// so if the greedy run gets stuck the level is unsolvable.
export function solve(level, deps = buildDeps(level)) {
  const n = level.snakes.length;
  const { blockers, selfBlocked } = deps;
  const dependents = Array.from({ length: n }, () => []);
  const remaining = new Array(n);
  for (let i = 0; i < n; i++) {
    remaining[i] = blockers[i].size;
    for (const b of blockers[i]) dependents[b].push(i);
  }
  const removed = new Array(n).fill(false);
  const depth = new Array(n).fill(0);
  const order = [];
  const steps = [];
  for (;;) {
    const free = [];
    for (let i = 0; i < n; i++) if (!removed[i] && remaining[i] === 0 && !selfBlocked[i]) free.push(i);
    if (free.length === 0) break;
    steps.push({ free: free.length, remaining: n - order.length });
    const pick = free[0];
    removed[pick] = true;
    order.push(pick);
    for (const d of dependents[pick]) {
      remaining[d]--;
      depth[d] = Math.max(depth[d], depth[pick] + 1);
    }
  }
  const maxDepth = n ? Math.max(...depth) + 1 : 0;
  return { solvable: order.length === n, order, steps, maxDepth };
}

// 0 = trivially loose, 1 = tight. Combines how many snakes are free at the start,
// how many are free on average while solving, and how many blocks are far from the head.
export function hardness(level) {
  const deps = buildDeps(level);
  const res = solve(level, deps);
  const n = level.snakes.length;
  if (!res.solvable || n === 0) return { value: 1, solvable: false, ...res };
  const f0 = res.steps[0].free / n;
  let loose = 0;
  for (const s of res.steps) loose += s.free / s.remaining;
  loose /= res.steps.length;
  let far = 0;
  for (let i = 0; i < n; i++) if (deps.farBlock[i]) far++;
  const farFrac = far / n;
  const value = Math.max(0, Math.min(1, 0.45 * (1 - f0) + 0.45 * (1 - loose) + 0.1 * farFrac));
  return { value, solvable: true, f0, loose, farFrac, maxDepth: res.maxDepth, order: res.order, steps: res.steps };
}

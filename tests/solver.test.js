import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeps, solve, hardness } from '../src/core/solver.js';

function lvl(w, h, ...snakes) {
  return { w, h, snakes: snakes.map((cells, id) => ({ id, color: 0, cells })) };
}

test('deps and order for a chain', () => {
  // 0 -> blocked by 1 -> blocked by 2, 2 free
  const L = lvl(7, 5,
    [[1, 2], [0, 2]],            // faces right, ray (2..6,2)
    [[3, 1], [3, 2], [3, 3]],    // faces up, ray (3,0); sits on ray of 0
    [[3, 0], [4, 0]],            // faces left, ray (2,0),(1,0),(0,0); sits on ray of 1
  );
  const deps = buildDeps(L);
  assert.deepEqual([...deps.blockers[0]], [1]);
  assert.deepEqual([...deps.blockers[1]], [2]);
  assert.deepEqual([...deps.blockers[2]], []);
  const r = solve(L, deps);
  assert.equal(r.solvable, true);
  assert.deepEqual(r.order, [2, 1, 0]);
  assert.equal(r.maxDepth, 3);
  assert.deepEqual(r.steps.map((s) => s.free), [1, 1, 1]);
});

test('cycle is unsolvable', () => {
  const L = lvl(4, 4,
    [[1, 1], [0, 1]],  // right, ray (2,1),(3,1)
    [[2, 2], [2, 3]],  // up, ray (2,1),(2,0)  -- wait, (2,1) is free; put snake 1 body on (2,1)
  );
  L.snakes[1].cells = [[2, 1], [2, 2], [2, 3]]; // head (2,1) faces up, ray (2,0)
  L.snakes.push({ id: 2, color: 0, cells: [[2, 0], [3, 0]] }); // faces left, ray (1,0),(0,0)
  L.snakes.push({ id: 3, color: 0, cells: [[1, 0], [1, 1]] }); // overlaps snake 0 at (1,1)? move it
  L.snakes[3].cells = [[0, 0], [0, 1]]; // hmm overlaps snake 0 too; rebuild cleanly below
  const C = lvl(4, 4,
    [[1, 2], [0, 2]],            // right, ray (2,2),(3,2)
    [[2, 2], [2, 3]],            // up, ray (2,1),(2,0)
    [[2, 1], [3, 1]],            // left, ray (1,1),(0,1)
    [[1, 1], [1, 0]],            // down, ray (1,2),(1,3) -> hits snake 0
  );
  const r = solve(C);
  assert.equal(r.solvable, false);
  assert.equal(hardness(C).value, 1);
});

test('hardness is lower when everything is free', () => {
  const free = lvl(6, 4, [[5, 0], [4, 0]], [[5, 1], [4, 1]], [[5, 2], [4, 2]]);
  const h = hardness(free);
  assert.equal(h.solvable, true);
  assert.ok(h.value < 0.05);
  const chain = lvl(7, 5, [[1, 2], [0, 2]], [[3, 1], [3, 2], [3, 3]], [[3, 0], [4, 0]]);
  assert.ok(hardness(chain).value > h.value);
});

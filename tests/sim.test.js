import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOccupancy } from '../src/core/level.js';
import { checkExitStatic, snakeCellsAtTick, exitTimeline } from '../src/core/sim.js';

function lvl(w, h, ...snakes) {
  return { w, h, snakes: snakes.map((cells, id) => ({ id, color: 0, cells })) };
}

test('free snake exits, blocked snake reports blocker and distance', () => {
  const L = lvl(6, 3, [[1, 1], [0, 1]], [[4, 0], [4, 1], [4, 2]]);
  const occ = buildOccupancy(L);
  const a = checkExitStatic(L, 0, occ);
  assert.equal(a.ok, false);
  assert.equal(a.blockedBy, 1);
  assert.deepEqual(a.at, [4, 1]);
  assert.equal(a.dist, 3);
  const b = checkExitStatic(L, 1, occ);
  assert.equal(b.ok, true);
  assert.equal(b.R, 0);
  assert.equal(b.ticks, 3);
});

test('self crossing: tail moves away in time (j + t >= L) is allowed', () => {
  // head (2,2) faces right, body loops under and comes back onto the ray at (3,2)
  const cells = [[2, 2], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2]];
  const L = lvl(5, 5, cells);
  const res = checkExitStatic(L, 0, buildOccupancy(L));
  assert.equal(res.ok, true);
  // at tick 1 the head is on (3,2) and the tail already left it
  const at1 = snakeCellsAtTick(L.snakes[0], 1);
  assert.deepEqual(at1[0], [3, 2]);
  assert.ok(!at1.slice(1).some((c) => c[0] === 3 && c[1] === 2));
});

test('self crossing: body still there when head arrives is blocked', () => {
  const cells = [[2, 2], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1]];
  const L = lvl(5, 5, cells);
  const res = checkExitStatic(L, 0, buildOccupancy(L));
  assert.equal(res.ok, false);
  assert.equal(res.self, true);
  assert.deepEqual(res.at, [3, 2]);
});

test('timeline: tail leaves the board at tick L + R', () => {
  const L = lvl(6, 3, [[1, 1], [0, 1], [0, 0]]); // L=3, ray (2,1),(3,1),(4,1),(5,1) R=4
  const tl = exitTimeline(L, 0);
  assert.equal(tl.length, 3 + 4 + 1);
  assert.equal(tl[0].size, 3);
  assert.equal(tl[7].size, 0);
  assert.ok(tl[6].size > 0);
  for (let T = 0; T < tl.length; T++) {
    const cells = snakeCellsAtTick(L.snakes[0], T);
    // segments stay chained
    for (let i = 1; i < cells.length; i++) {
      const d = Math.abs(cells[i][0] - cells[i - 1][0]) + Math.abs(cells[i][1] - cells[i - 1][1]);
      assert.equal(d, 1, `tick ${T} segment ${i}`);
    }
  }
});

test('a rock on the ray blocks the snake permanently', () => {
  const L = { w: 6, h: 3, rocks: [[4, 1]], snakes: [{ id: 0, color: 0, cells: [[1, 1], [0, 1]] }] };
  const r = checkExitStatic(L, 0, buildOccupancy(L));
  assert.equal(r.ok, false);
  assert.equal(r.rock, true);
  assert.deepEqual(r.at, [4, 1]);
});

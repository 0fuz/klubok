import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLevel, rayCells, headDir, levelToAscii } from '../src/core/level.js';

const ok = { w: 4, h: 3, snakes: [{ id: 0, cells: [[1, 1], [0, 1], [0, 2]] }] };

test('validateLevel accepts a sane level', () => {
  assert.deepEqual(validateLevel(ok), []);
});

test('validateLevel catches overlap, gaps, bounds and short snakes', () => {
  const bad = {
    w: 4, h: 3,
    snakes: [
      { id: 0, cells: [[1, 1], [0, 1]] },
      { id: 1, cells: [[1, 1], [3, 1]] },
      { id: 2, cells: [[9, 9]] },
    ],
  };
  const errs = validateLevel(bad);
  assert.ok(errs.some((e) => e.includes('overlaps')));
  assert.ok(errs.some((e) => e.includes('not adjacent')));
  assert.ok(errs.some((e) => e.includes('out of bounds')));
  assert.ok(errs.some((e) => e.includes('< 2')));
});

test('headDir and rayCells', () => {
  const s = ok.snakes[0];
  assert.deepEqual(headDir(s), [1, 0]);
  assert.deepEqual(rayCells(ok, s), [[2, 1], [3, 1]]);
  const up = { w: 3, h: 4, snakes: [{ id: 0, cells: [[1, 0], [1, 1]] }] };
  assert.deepEqual(rayCells(up, up.snakes[0]), []);
});

test('ascii render shows heads as arrows', () => {
  const art = levelToAscii(ok);
  assert.equal(art, '....\na>..\na...');
});

test('rocks validate and render', () => {
  const L = { w: 4, h: 3, rocks: [[3, 0]], snakes: [{ id: 0, cells: [[1, 1], [0, 1], [0, 2]] }] };
  assert.deepEqual(validateLevel(L), []);
  assert.equal(levelToAscii(L), '...#\na>..\na...');
  const bad = { ...L, rocks: [[1, 1], [9, 9]] };
  const errs = validateLevel(bad);
  assert.ok(errs.some((e) => e.includes('overlaps')) && errs.some((e) => e.includes('out of bounds')));
});

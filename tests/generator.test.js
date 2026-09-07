import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, generateCandidate } from '../src/core/generator.js';
import { validateLevel, buildOccupancy, rayCells } from '../src/core/level.js';
import { paramsForLevel } from '../src/core/difficulty.js';
import { buildDeps, solve, hardness } from '../src/core/solver.js';
import { checkExitStatic } from '../src/core/sim.js';
import { Rng } from '../src/core/rng.js';
import { PALETTE_SIZE } from '../src/core/colors.js';

const LEVELS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 80, 120, 160, 300];
const ASPECTS = [0.75, 1.33, 1.78];

// Play the level exactly as a player would: tap snakes in solver order, each must be free
// against the current occupancy, and the board must end up empty.
function playThrough(level) {
  const { order, solvable } = solve(level);
  assert.equal(solvable, true, 'solver says unsolvable');
  const occ = buildOccupancy(level);
  for (const i of order) {
    const r = checkExitStatic(level, i, occ);
    assert.equal(r.ok, true, `snake ${i} blocked during play-through`);
    for (const [x, y] of level.snakes[i].cells) occ[y * level.w + x] = -1;
  }
  assert.ok(occ.every((v) => v < 0), 'board not empty after play-through');
}

test('generated levels are valid, solvable and match params', () => {
  for (const a of ASPECTS) {
    for (const n of LEVELS) {
      const level = generateLevel(n, a);
      const p = paramsForLevel(n, a);
      assert.deepEqual(validateLevel(level), [], `level ${n} aspect ${a}`);
      assert.equal(level.w, p.w);
      assert.equal(level.h, p.h);
      assert.ok(level.snakes.length >= 2, `level ${n}: too few snakes`);
      const deps = buildDeps(level);
      assert.ok(!deps.selfBlocked.some(Boolean), `level ${n}: snake blocked by itself or a rock`);
      const occ = buildOccupancy(level);
      for (const s of level.snakes) for (const [x, y] of rayCells(level, s)) assert.notEqual(occ[y * level.w + x], -2, `level ${n}: rock on a ray`);
      playThrough(level);
      for (const s of level.snakes) {
        assert.ok(s.cells.length <= Math.ceil(p.lenMax * 1.5) + 1, `snake too long: ${s.cells.length}`);
        assert.ok(s.color >= 0 && s.color < PALETTE_SIZE);
      }
    }
  }
});

test('generation is deterministic', () => {
  const a = JSON.stringify(generateLevel(17, 1.33));
  const b = JSON.stringify(generateLevel(17, 1.33));
  assert.equal(a, b);
  assert.notEqual(a, JSON.stringify(generateLevel(18, 1.33)));
});

test('touching snakes never share a color', () => {
  const level = generateLevel(40, 1.5);
  const occ = buildOccupancy(level);
  for (const s of level.snakes) {
    for (const [x, y] of s.cells) {
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue;
        const o = occ[ny * level.w + nx];
        if (o >= 0 && o !== s.id) assert.notEqual(level.snakes[o].color, s.color);
      }
    }
  }
});

test('early levels keep rays simple and stay easy', () => {
  const p = paramsForLevel(1, 1.33);
  assert.equal(p.rayCross, 0);
  for (let n = 1; n <= 5; n++) {
    const h = hardness(generateLevel(n, 1.33));
    assert.ok(h.value < 0.55, `level ${n} hardness ${h.value}`);
  }
});

test('big levels fill most of the board', () => {
  const level = generateLevel(150, 1.5);
  const cells = level.snakes.reduce((a, s) => a + s.cells.length, 0);
  const usable = level.w * level.h - level.rocks.length;
  assert.ok(cells / usable > 0.97, `fill ${cells / usable}`);
});

test('rocks appear and keep growing, free snakes stay in the 5-10 band', () => {
  assert.equal(generateLevel(10, 1.5).rocks.length, 0);
  const r150 = generateLevel(150, 1.5).rocks.length;
  const r500 = generateLevel(500, 1.5).rocks.length;
  assert.ok(r150 > 20, `rocks at 150: ${r150}`);
  assert.ok(r500 > r150, `rocks 500 (${r500}) should exceed 150 (${r150})`);
  for (const n of [150, 300, 600]) {
    const h = hardness(generateLevel(n, 1.5));
    assert.ok(h.steps[0].free >= 3 && h.steps[0].free <= 32, `level ${n}: ${h.steps[0].free} free snakes`);
  }
  const a = paramsForLevel(200, 1.5), b = paramsForLevel(500, 1.5);
  assert.ok(b.rockBorder > a.rockBorder && b.lenMax > a.lenMax && b.targetFree < a.targetFree);
});

test('difficulty grows: later levels are tighter and bigger', () => {
  const avg = (n) => {
    let s = 0;
    for (let k = 0; k < 5; k++) s += hardness(generateLevel(n, 1.33, 1000 + k)).value;
    return s / 5;
  };
  const h1 = avg(1), h30 = avg(30), h90 = avg(90);
  assert.ok(h30 > h1, `h30 ${h30} <= h1 ${h1}`);
  assert.ok(h90 > h30, `h90 ${h90} <= h30 ${h30}`);
  const big = paramsForLevel(160, 1.78);
  assert.equal(big.w, 90);
  assert.ok(big.h >= 50);
});

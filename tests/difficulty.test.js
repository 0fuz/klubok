import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramsForLevel, MAX_SIDE, MAX_CELLS } from '../src/core/difficulty.js';

test('params are monotone and capped', () => {
  let prev = paramsForLevel(1, 1.33);
  assert.ok(prev.w * prev.h <= 40);
  for (let n = 2; n <= 400; n++) {
    const p = paramsForLevel(n, 1.33);
    assert.ok(p.w <= MAX_SIDE && p.h <= MAX_SIDE);
    assert.ok(p.w * p.h <= MAX_CELLS + MAX_SIDE);
    assert.ok(p.fill >= prev.fill - 1e-9);
    assert.ok(p.lenMax >= prev.lenMax);
    assert.ok(p.targetHardness >= prev.targetHardness - 1e-9);
    assert.ok(p.rayMax >= prev.rayMax);
    prev = p;
  }
});

test('aspect shapes the board', () => {
  const wide = paramsForLevel(50, 1.78), tall = paramsForLevel(50, 0.6);
  assert.ok(wide.w > wide.h);
  assert.ok(tall.h > tall.w);
});

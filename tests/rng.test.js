import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, mix, hashString } from '../src/core/rng.js';

test('rng is deterministic for a seed', () => {
  const a = new Rng(42), b = new Rng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('rng values stay in [0,1) and int/range respect bounds', () => {
  const r = new Rng(7);
  for (let i = 0; i < 10000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
    const k = r.int(5);
    assert.ok(k >= 0 && k < 5);
    const q = r.range(3, 6);
    assert.ok(q >= 3 && q <= 6);
  }
});

test('weighted picks respect zero weights', () => {
  const r = new Rng(1);
  for (let i = 0; i < 200; i++) assert.equal(r.weighted([0, 1, 0]), 1);
});

test('mix and hashString spread seeds', () => {
  const s = new Set();
  for (let i = 0; i < 1000; i++) s.add(mix(123, i));
  assert.equal(s.size, 1000);
  assert.notEqual(hashString('a'), hashString('b'));
});

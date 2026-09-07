// Generation timing and stats across levels.
import { generateLevel } from '../src/core/generator.js';
import { hardness } from '../src/core/solver.js';

const levels = [1, 5, 10, 20, 40, 60, 80, 100, 120, 150, 200, 300, 500, 800];
console.log('level  size    snakes  cells%  empty  rocks  hard  target  free0  depth   ms');
for (const n of levels) {
  const t0 = performance.now();
  const l = generateLevel(n, 1.5);
  const ms = performance.now() - t0;
  const h = hardness(l);
  const cells = l.snakes.reduce((a, s) => a + s.cells.length, 0);
  console.log(
    String(n).padEnd(6),
    `${l.w}x${l.h}`.padEnd(8),
    String(l.snakes.length).padEnd(7),
    (100 * cells / (l.w * l.h - l.rocks.length)).toFixed(1).padEnd(7),
    String(l.w * l.h - cells - l.rocks.length).padEnd(6),
    String(l.rocks.length).padEnd(6),
    h.value.toFixed(2).padEnd(5),
    l.params.targetHardness.toFixed(2).padEnd(7),
    String(h.steps[0].free).padEnd(6),
    String(h.maxDepth).padEnd(7),
    ms.toFixed(0),
  );
}

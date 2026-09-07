// Print a generated level as ASCII plus its dependency stats.
// usage: node tools/show.js <level> [aspect] [seed]
import { generateLevel } from '../src/core/generator.js';
import { levelToAscii } from '../src/core/level.js';
import { hardness } from '../src/core/solver.js';

const n = Number(process.argv[2] || 1);
const aspect = Number(process.argv[3] || 1.33);
const seed = process.argv[4] ? Number(process.argv[4]) : undefined;
const lvl = generateLevel(n, aspect, seed);
const h = hardness(lvl);
console.log(levelToAscii(lvl));
console.log(`level ${n}  ${lvl.w}x${lvl.h}  snakes ${lvl.snakes.length}  hardness ${h.value.toFixed(2)} (target ${lvl.params.targetHardness.toFixed(2)})`);
console.log(`free at start ${h.steps[0].free}  mean free ratio ${h.loose.toFixed(2)}  chain depth ${h.maxDepth}  far blocks ${(h.farFrac * 100).toFixed(0)}%`);
console.log(`solve order: ${h.order.join(' ')}`);

// Runtime state of one level: lives, which snakes are idle / moving / gone, and the
// tick-based collision rules for tapping while other snakes are still sliding out.

import { buildOccupancy, cellIndex } from '../core/level.js';
import { checkExitStatic, exitTimeline } from '../core/sim.js';

export const TICK_MS = 40; // one cell per tick = 25 cells/s
export const FADE_TICKS = 2; // extra ticks after the tail leaves the board (fade out)
export const LIVES = 3;

export class Game {
  constructor(level) {
    this.level = level;
    this.n = level.snakes.length;
    this.status = new Array(this.n).fill('idle');
    this.occ = buildOccupancy(level);
    this.lives = LIVES;
    this.moving = new Map();
    this.over = false;
    this.won = false;
    this.gone = 0;
    this.taps = 0;
    this.misses = 0;
  }

  // Index of the idle snake covering cell (x,y), or -1.
  snakeAt(x, y) {
    const l = this.level;
    if (x < 0 || y < 0 || x >= l.w || y >= l.h) return -1;
    return this.occ[cellIndex(l, x, y)];
  }

  tap(i, now) {
    if (this.over || this.won || this.status[i] !== 'idle') return { result: 'ignored' };
    this.taps++;
    const res = checkExitStatic(this.level, i, this.occ);
    if (!res.ok) {
      this.misses++;
      this.lives--;
      if (this.lives <= 0) this.over = true;
      return { result: 'blocked', ...res };
    }
    const { L, R, ray } = res;
    // Snakes already on the move still occupy cells. Start at the first tick where the
    // head never shares a cell (at either end of a step) with any of them.
    let S = Math.ceil(now);
    for (;;) {
      let conflict = false;
      for (const m of this.moving.values()) {
        if (S >= m.end) continue;
        for (let t = 1; t <= R && !conflict; t++) {
          const k = cellIndex(this.level, ray[t - 1][0], ray[t - 1][1]);
          for (const T of [S + t - 1, S + t]) {
            const rel = T - m.start;
            if (rel < 0 || rel >= m.timeline.length) continue;
            if (m.timeline[rel].has(k)) { conflict = true; break; }
          }
        }
        if (conflict) break;
      }
      if (!conflict) break;
      S++;
    }
    this.status[i] = 'moving';
    for (const [x, y] of this.level.snakes[i].cells) this.occ[cellIndex(this.level, x, y)] = -1;
    const timeline = exitTimeline(this.level, i);
    const m = { start: S, end: S + L + R, L, R, ray, timeline };
    this.moving.set(i, m);
    return { result: 'ok', start: S, delay: S - now, L, R, ray };
  }

  update(now) {
    const finished = [];
    for (const [i, m] of this.moving) {
      if (now >= m.end + FADE_TICKS) {
        this.moving.delete(i);
        this.status[i] = 'gone';
        this.gone++;
        finished.push(i);
      }
    }
    if (this.gone === this.n && !this.won) this.won = true;
    return finished;
  }
}

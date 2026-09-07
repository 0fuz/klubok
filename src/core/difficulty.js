// Level number -> generation parameters. Everything grows smoothly and saturates.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const MAX_SIDE = 90;
export const MAX_CELLS = 5400;

export function paramsForLevel(level, aspect = 1) {
  const t = Math.max(0, level - 1);
  const u = 1 - Math.exp(-t / 60); // 0 -> 1, ~0.63 at level 61, ~0.86 at level 121
  // Second, slower phase: once the board has hit its maximum size (~level 150) the
  // structure keeps tightening: rock walls close, snakes get longer, fewer free snakes.
  const v = 1 - Math.exp(-Math.max(0, level - 150) / 300);
  const lateFree = Math.round(lerp(8, 3, v));
  const cells = Math.min(MAX_CELLS, Math.round(30 * Math.pow(1.035, t)));
  const a = clamp(aspect || 1, 0.5, 2.2);
  const w = clamp(Math.round(Math.sqrt(cells * a)), 4, MAX_SIDE);
  const h = clamp(Math.round(cells / w), 4, MAX_SIDE);
  return {
    level,
    w,
    h,
    fill: lerp(0.5, 0.85, u),
    lenMin: Math.round(lerp(3, 5, u)),
    lenMax: Math.round(lerp(5, 16, u) + 14 * v),
    turn: lerp(0.15, 0.45, u),
    rayMax: Math.round(lerp(3, MAX_SIDE, u)),
    crossBias: lerp(0.15, 0.9, u),
    rayCross: level < 12 ? 0 : Math.round(lerp(0, 6, u)),
    pocketRayCross: level < 12 ? 1 : Infinity,
    centerBias: 0.6,
    targetHardness: lerp(0.25, 0.88, u) + 0.08 * v,
    // free snakes at the start: a fraction early on, an absolute 10 -> 5 later
    freeFrac: lerp(0.6, 0.12, u),
    targetFree: level < 150 ? null : lateFree,
    edgeQuota: level < 150 ? Infinity : lateFree, // snakes sitting at an exit facing out
    // rocks: border walls with gaps from level 40, scattered boulders from level 25
    rockBorder: level < 40 ? 0 : 1 - Math.exp(-(level - 40) / 250),
    // scattered boulders must stay rare: every boulder shadows a whole row and column
    rockInner: level < 25 ? 0 : 0.005 * (1 - Math.exp(-(level - 25) / 250)),
    candidates: cells > 2500 ? 3 : cells > 800 ? 5 : 8,
    maxFails: 200,
  };
}

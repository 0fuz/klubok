// A track is a polyline through cell centres with rounded corners, parametrised by the
// raw vertex index (1 unit = 1 cell of travel). Slicing a track by raw parameter gives a
// snake body at any fractional moment of its movement.

export function buildTrack(verts) {
  const xs = [], ys = [], ss = [];
  const push = (x, y, s) => { xs.push(x); ys.push(y); ss.push(s); };
  const n = verts.length;
  push(verts[0][0], verts[0][1], 0);
  const K = 6;
  for (let i = 1; i < n - 1; i++) {
    const a = verts[i - 1], v = verts[i], b = verts[i + 1];
    const cross = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]);
    if (cross === 0) { push(v[0], v[1], i); continue; }
    const m1x = (a[0] + v[0]) / 2, m1y = (a[1] + v[1]) / 2;
    const m2x = (v[0] + b[0]) / 2, m2y = (v[1] + b[1]) / 2;
    for (let k = 0; k <= K; k++) {
      const t = k / K, u = 1 - t;
      push(u * u * m1x + 2 * u * t * v[0] + t * t * m2x, u * u * m1y + 2 * u * t * v[1] + t * t * m2y, i - 0.5 + t);
    }
  }
  push(verts[n - 1][0], verts[n - 1][1], n - 1);
  return { xs, ys, ss, len: n - 1 };
}

export function pointAt(track, s) {
  const { xs, ys, ss } = track;
  const last = ss.length - 1;
  if (s <= ss[0]) return [xs[0], ys[0]];
  if (s >= ss[last]) return [xs[last], ys[last]];
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ss[mid] <= s) lo = mid; else hi = mid;
  }
  const span = ss[hi] - ss[lo];
  const t = span > 0 ? (s - ss[lo]) / span : 0;
  return [xs[lo] + (xs[hi] - xs[lo]) * t, ys[lo] + (ys[hi] - ys[lo]) * t];
}

// Points from raw parameter s0 to s1 (s0 < s1), in increasing order.
export function slice(track, s0, s1) {
  const { xs, ys, ss } = track;
  const out = [pointAt(track, s0)];
  let lo = 0, hi = ss.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ss[mid] <= s0) lo = mid; else hi = mid;
  }
  for (let i = hi; i < ss.length && ss[i] < s1; i++) if (ss[i] > s0) out.push([xs[i], ys[i]]);
  out.push(pointAt(track, s1));
  return out;
}

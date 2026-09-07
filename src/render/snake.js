// Drawing one snake from a head-first list of world points (1 unit = 1 cell).

const TAU = Math.PI * 2;

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

export function drawSnake(ctx, pts, col, theme, o = {}) {
  const n = pts.length;
  if (n < 1) return;
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const path = new Path2D();
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n; i++) path.lineTo(pts[i][0], pts[i][1]);
  if (n === 1) path.lineTo(pts[0][0] + 0.001, pts[0][1]);

  // drop shadow
  ctx.save();
  ctx.translate(0.05, 0.09);
  ctx.strokeStyle = theme.snakeShadow;
  ctx.lineWidth = 0.8;
  ctx.stroke(path);
  ctx.restore();

  ctx.strokeStyle = col.dark;
  ctx.lineWidth = 0.8;
  ctx.stroke(path);
  ctx.strokeStyle = col.base;
  ctx.lineWidth = 0.62;
  ctx.stroke(path);

  // top-left highlight along the body
  ctx.save();
  ctx.translate(-0.06, -0.09);
  ctx.globalAlpha = alpha * 0.4;
  ctx.strokeStyle = col.light;
  ctx.lineWidth = 0.2;
  ctx.stroke(path);
  ctx.restore();

  if (o.scales !== false && n > 1) drawScales(ctx, pts, col, alpha);
  drawHead(ctx, pts, col, theme, o, alpha);
  ctx.globalAlpha = 1;
}

function drawScales(ctx, pts, col, alpha) {
  ctx.globalAlpha = alpha * 0.28;
  ctx.strokeStyle = col.deep;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  let next = 0.8;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    while (next <= acc + len) {
      const t = (next - acc) / len;
      const x = ax + dx * t, y = ay + dy * t;
      const ang = Math.atan2(dy, dx); // towards the tail
      ctx.moveTo(x + Math.cos(ang - 0.9) * 0.21, y + Math.sin(ang - 0.9) * 0.21);
      ctx.arc(x, y, 0.21, ang - 0.9, ang + 0.9);
      next += 0.5;
    }
    acc += len;
  }
  ctx.stroke();
  ctx.globalAlpha = alpha;
}

function drawHead(ctx, pts, col, theme, o, alpha) {
  const [hx, hy] = pts[0];
  let dx, dy;
  if (o.dir) [dx, dy] = o.dir;
  else if (pts.length > 1) {
    dx = hx - pts[1][0]; dy = hy - pts[1][1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
  } else { dx = 1; dy = 0; }
  const nx = -dy, ny = dx;

  if (o.tongue) {
    const bx = hx + dx * 0.4, by = hy + dy * 0.4;
    const len = 0.22 + 0.12 * o.tongue;
    ctx.strokeStyle = theme.tongue;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + dx * len, by + dy * len);
    ctx.lineTo(bx + dx * (len + 0.1) + nx * 0.08, by + dy * (len + 0.1) + ny * 0.08);
    ctx.moveTo(bx + dx * len, by + dy * len);
    ctx.lineTo(bx + dx * (len + 0.1) - nx * 0.08, by + dy * (len + 0.1) - ny * 0.08);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(0.05, 0.09);
  circle(ctx, hx, hy, 0.47);
  ctx.fillStyle = theme.snakeShadow;
  ctx.fill();
  ctx.restore();
  circle(ctx, hx, hy, 0.47);
  ctx.fillStyle = col.dark;
  ctx.fill();
  circle(ctx, hx, hy, 0.4);
  ctx.fillStyle = col.base;
  ctx.fill();
  circle(ctx, hx - 0.1, hy - 0.13, 0.17);
  ctx.fillStyle = col.light;
  ctx.globalAlpha = alpha * 0.4;
  ctx.fill();
  ctx.globalAlpha = alpha;

  for (const s of [-1, 1]) {
    const ex = hx + dx * 0.17 + nx * 0.2 * s, ey = hy + dy * 0.17 + ny * 0.2 * s;
    circle(ctx, ex, ey, 0.135);
    ctx.fillStyle = theme.eye;
    ctx.fill();
    ctx.strokeStyle = col.deep;
    ctx.lineWidth = 0.03;
    ctx.stroke();
    const squint = o.squint || 0;
    circle(ctx, ex + dx * 0.05, ey + dy * 0.05, 0.068 * (1 - 0.5 * squint));
    ctx.fillStyle = theme.pupil;
    ctx.fill();
    circle(ctx, ex + dx * 0.03 - 0.03, ey + dy * 0.03 - 0.03, 0.026);
    ctx.fillStyle = theme.eye;
    ctx.fill();
  }
}

export function drawCellRing(ctx, x, y, color, alpha, grow = 0) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.12;
  const pad = -0.02 - grow * 0.12;
  ctx.beginPath();
  ctx.roundRect(x + pad, y + pad, 1 - 2 * pad, 1 - 2 * pad, 0.28);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

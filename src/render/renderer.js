// Canvas renderer with a cached static layer (board + idle snakes) and a dynamic pass
// for moving snakes and effects. Nothing is drawn unless something changed.

import { buildTrack, slice } from './track.js';
import { drawSnake, drawCellRing } from './snake.js';
import { THEMES, colorSets, mixHex, shade } from './palette.js';
import { headDir, snakeBBox } from '../core/level.js';

const MARGIN = 1.5;
const MAX_SCALE = 160;
const BUMP_MS = 640;
const RING_MS = 700;
const SHOVE_MS = 320;
const INTRO_MS = 700;
const OUTRO_MS = 380;

const easeOut = (u) => 1 - (1 - u) * (1 - u);
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.layer = document.createElement('canvas');
    this.lctx = this.layer.getContext('2d', { alpha: false });
    this.cam = { scale: 24, cx: 0, cy: 0 };
    this.layerCam = null;
    this.dirty = true;
    this.gesture = false;
    this.lastCamChange = -Infinity;
    this.W = 1; this.H = 1; this.dpr = 1;
    this.level = null;
    this.moving = new Map();
    this.effects = [];
    this.hidden = new Set();
    this.intro = null;
    this.outro = null;
    this.setTheme('light');
  }

  setTheme(name) {
    this.themeName = name;
    this.theme = THEMES[name] || THEMES.light;
    this.colors = colorSets(name);
    this.warnDark = shade(this.theme.warn, -0.22);
    this.dirty = true;
  }

  setLevel(level, game) {
    this.level = level;
    this.game = game;
    this.staticPts = level.snakes.map((s) => {
      const t = buildTrack(s.cells.map(([x, y]) => [x + 0.5, y + 0.5]));
      return slice(t, 0, t.len);
    });
    this.bboxes = level.snakes.map(snakeBBox);
    this.moving.clear();
    this.effects = [];
    this.hidden.clear();
    this.outro = null;
    this.dirty = true;
  }

  startIntro() {
    this.intro = { t0: performance.now() };
    const l = this.level;
    const cx = l.w / 2, cy = l.h / 2;
    const maxD = Math.hypot(cx, cy) || 1;
    this.introDelay = l.snakes.map((s) => Math.hypot(s.cells[0][0] + 0.5 - cx, s.cells[0][1] + 0.5 - cy) / maxD);
    this.dirty = true;
  }

  startOutro() {
    this.outro = { t0: performance.now() };
    this.dirty = true;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(this.W * this.dpr), ph = Math.round(this.H * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw; this.canvas.height = ph;
      this.layer.width = pw; this.layer.height = ph;
    }
    this.layerCam = null;
    this.dirty = true;
  }

  fitScale() {
    const l = this.level;
    return Math.min(this.W / (l.w + 2 * MARGIN), this.H / (l.h + 2 * MARGIN));
  }
  fit() {
    this.cam.scale = this.fitScale();
    this.cam.cx = this.level.w / 2;
    this.cam.cy = this.level.h / 2;
    this.dirty = true;
  }
  isZoomed() { return this.cam.scale > this.fitScale() * 1.02; }

  screenToWorld(sx, sy) {
    const c = this.cam;
    return [(sx - this.W / 2) / c.scale + c.cx, (sy - this.H / 2) / c.scale + c.cy];
  }

  zoomAt(sx, sy, f) {
    const c = this.cam;
    const [wx, wy] = this.screenToWorld(sx, sy);
    const fs = this.fitScale();
    const ns = Math.max(fs * 0.85, Math.min(MAX_SCALE, c.scale * f));
    c.scale = ns;
    c.cx = wx - (sx - this.W / 2) / ns;
    c.cy = wy - (sy - this.H / 2) / ns;
    this.camChanged();
  }
  panBy(dx, dy) {
    this.cam.cx -= dx / this.cam.scale;
    this.cam.cy -= dy / this.cam.scale;
    this.camChanged();
  }
  camChanged() {
    const c = this.cam, l = this.level;
    const vw = this.W / c.scale, vh = this.H / c.scale;
    if (vw >= l.w + 2 * MARGIN) c.cx = l.w / 2;
    else c.cx = Math.max(vw / 2 - MARGIN, Math.min(l.w + MARGIN - vw / 2, c.cx));
    if (vh >= l.h + 2 * MARGIN) c.cy = l.h / 2;
    else c.cy = Math.max(vh / 2 - MARGIN, Math.min(l.h + MARGIN - vh / 2, c.cy));
    this.lastCamChange = performance.now();
    this.dirty = true;
  }

  startMove(i, m) {
    const s = this.level.snakes[i];
    const [dx, dy] = headDir(s);
    const verts = [];
    for (let k = s.cells.length - 1; k >= 0; k--) verts.push([s.cells[k][0] + 0.5, s.cells[k][1] + 0.5]);
    const [hx, hy] = s.cells[0];
    const beyond = m.R + s.cells.length + 4;
    for (let t = 1; t <= beyond; t++) verts.push([hx + dx * t + 0.5, hy + dy * t + 0.5]);
    this.moving.set(i, { track: buildTrack(verts), start: m.start, L: m.L, R: m.R, dir: [dx, dy], phase: Math.random() * 7 });
    this.dirty = true;
  }

  bump(i, res) {
    const s = this.level.snakes[i];
    const [dx, dy] = headDir(s);
    const verts = [];
    for (let k = s.cells.length - 1; k >= 0; k--) verts.push([s.cells[k][0] + 0.5, s.cells[k][1] + 0.5]);
    const [hx, hy] = s.cells[0];
    verts.push([hx + dx + 0.5, hy + dy + 0.5]);
    this.hidden.add(i);
    const t0 = performance.now();
    this.effects.push({ kind: 'bump', i, t0, track: buildTrack(verts), L: s.cells.length, dir: [dx, dy], dist: res.dist });
    this.effects.push({ kind: 'ring', t0, x: res.at[0], y: res.at[1] });
    const b = res.blockedBy;
    if (!res.self && b >= 0 && this.game.status[b] === 'idle' && !this.hidden.has(b)) {
      this.hidden.add(b);
      this.effects.push({ kind: 'shove', i: b, t0: t0 + 60, dir: [dx, dy] });
    }
    this.dirty = true;
  }

  // Impact look: a short white flash, then a red tint that fades back to the own colour.
  flashColors(col, white, red) {
    if (white <= 0 && red <= 0) return col;
    const w = this.theme.warn, wd = this.warnDark;
    const mix = (c, target, t) => mixHex(mixHex(c, target, t), '#FFFFFF', 0.85 * white);
    return {
      base: mix(col.base, w, 0.8 * red),
      dark: mix(col.dark, wd, 0.8 * red),
      light: mix(col.light, '#FFC4C4', 0.6 * red),
      deep: mix(col.deep, wd, 0.8 * red),
    };
  }

  needsFrame() {
    return this.moving.size > 0 || this.effects.length > 0 || this.dirty || this.gesture || !!this.intro || !!this.outro;
  }

  applyCam(ctx, cam) {
    const s = this.dpr * cam.scale;
    ctx.setTransform(s, 0, 0, s, this.dpr * (this.W / 2 - cam.cx * cam.scale), this.dpr * (this.H / 2 - cam.cy * cam.scale));
  }

  viewRect() {
    const c = this.cam;
    const vw = this.W / c.scale, vh = this.H / c.scale;
    return { x0: c.cx - vw / 2 - 1, y0: c.cy - vh / 2 - 1, x1: c.cx + vw / 2 + 1, y1: c.cy + vh / 2 + 1 };
  }

  drawBoard(ctx, alpha, scale) {
    const l = this.level, th = this.theme;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (scale !== 1) {
      ctx.translate(l.w / 2, l.h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-l.w / 2, -l.h / 2);
    }
    ctx.fillStyle = th.boardShadow;
    ctx.beginPath();
    ctx.roundRect(-0.3 + 0.06, -0.3 + 0.14, l.w + 0.6, l.h + 0.6, 0.6);
    ctx.fill();
    ctx.fillStyle = th.board;
    ctx.beginPath();
    ctx.roundRect(-0.3, -0.3, l.w + 0.6, l.h + 0.6, 0.6);
    ctx.fill();
    ctx.strokeStyle = th.boardStroke;
    ctx.lineWidth = 1.5 / this.cam.scale;
    ctx.stroke();
    if (this.cam.scale >= 7) {
      ctx.strokeStyle = th.grid;
      ctx.lineWidth = 1 / this.cam.scale;
      ctx.beginPath();
      for (let x = 1; x < l.w; x++) { ctx.moveTo(x, 0); ctx.lineTo(x, l.h); }
      for (let y = 1; y < l.h; y++) { ctx.moveTo(0, y); ctx.lineTo(l.w, y); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Rocks: chunky rounded stones; neighbours visually join into walls.
  drawRocks(ctx) {
    const l = this.level, th = this.theme;
    if (!l.rocks || !l.rocks.length) return;
    const v = this.viewRect();
    const detail = this.cam.scale >= 12;
    const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
    ctx.save();
    ctx.lineJoin = 'round';
    // shadow + dark base
    ctx.fillStyle = th.rockDark;
    ctx.beginPath();
    for (const [x, y] of l.rocks) {
      if (x + 1 < v.x0 || x > v.x1 || y + 1 < v.y0 || y > v.y1) continue;
      ctx.roundRect(x + 0.03, y + 0.1, 0.94, 0.9, 0.3);
    }
    ctx.fill();
    ctx.fillStyle = th.rock;
    ctx.beginPath();
    for (const [x, y] of l.rocks) {
      if (x + 1 < v.x0 || x > v.x1 || y + 1 < v.y0 || y > v.y1) continue;
      ctx.roundRect(x + 0.03, y + 0.02, 0.94, 0.88, 0.3);
    }
    ctx.fill();
    if (detail) {
      ctx.fillStyle = th.rockLight;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (const [x, y] of l.rocks) {
        if (x + 1 < v.x0 || x > v.x1 || y + 1 < v.y0 || y > v.y1) continue;
        const hh = hash(x, y);
        const ox = 0.14 + (hh % 7) * 0.03, oy = 0.1 + ((hh >> 3) % 5) * 0.03;
        ctx.roundRect(x + ox, y + oy, 0.36 + ((hh >> 6) % 4) * 0.05, 0.2, 0.1);
      }
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = th.rockDark;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (const [x, y] of l.rocks) {
        if (x + 1 < v.x0 || x > v.x1 || y + 1 < v.y0 || y > v.y1) continue;
        const hh = hash(x, y);
        if (hh % 3 !== 0) continue;
        const sx = x + 0.3 + (hh % 5) * 0.08, sy = y + 0.55 + ((hh >> 4) % 3) * 0.08;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 0.18, sy + 0.12);
        ctx.lineTo(sx + 0.32, sy + 0.08);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  renderLayer() {
    const ctx = this.lctx, l = this.level, th = this.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, this.layer.width, this.layer.height);
    this.applyCam(ctx, this.cam);

    if (!this.outro) { this.drawBoard(ctx, 1, 1); this.drawRocks(ctx); }

    const v = this.viewRect();
    const scales = this.cam.scale >= 9;
    const st = this.game.status;
    if (!this.intro) {
      for (let i = 0; i < l.snakes.length; i++) {
        if (st[i] !== 'idle' || this.hidden.has(i)) continue;
        const b = this.bboxes[i];
        if (b.x1 < v.x0 || b.x0 > v.x1 || b.y1 < v.y0 || b.y0 > v.y1) continue;
        drawSnake(ctx, this.staticPts[i], this.colors[l.snakes[i].color], th, { scales });
      }
    }
    this.layerCam = { ...this.cam };
    this.dirty = false;
  }

  frame(nowMs, tick) {
    if (!this.level) return;
    const settled = nowMs - this.lastCamChange > 90;
    if (this.layerCam === null || (this.dirty && !this.gesture && settled)) this.renderLayer();

    const ctx = this.ctx, A = this.layerCam, B = this.cam;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (A.scale === B.scale && A.cx === B.cx && A.cy === B.cy) {
      ctx.drawImage(this.layer, 0, 0);
    } else {
      ctx.fillStyle = this.theme.bg;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const k = B.scale / A.scale;
      const tx = this.dpr * (this.W / 2 * (1 - k) + (A.cx - B.cx) * B.scale);
      const ty = this.dpr * (this.H / 2 * (1 - k) + (A.cy - B.cy) * B.scale);
      ctx.setTransform(k, 0, 0, k, tx, ty);
      ctx.drawImage(this.layer, 0, 0);
    }

    this.applyCam(ctx, B);
    const scales = B.scale >= 9;

    if (this.outro) {
      const u = Math.min(1, (nowMs - this.outro.t0) / OUTRO_MS);
      this.drawBoard(ctx, 1 - easeOut(u), 1 - 0.1 * easeInOut(u));
      if (u >= 1) this.outro = null;
    }
    if (this.intro) {
      const u = (nowMs - this.intro.t0) / INTRO_MS;
      const l = this.level, v = this.viewRect(), st = this.game.status;
      let allDone = true;
      for (let i = 0; i < l.snakes.length; i++) {
        if (st[i] !== 'idle') continue;
        const b = this.bboxes[i];
        if (b.x1 < v.x0 || b.x0 > v.x1 || b.y1 < v.y0 || b.y0 > v.y1) continue;
        const p = Math.max(0, Math.min(1, (u * 1.6 - 0.6 * this.introDelay[i]) / 1));
        if (p < 1) allDone = false;
        if (p <= 0) continue;
        const e = easeOut(p);
        const k = 0.55 + 0.45 * e;
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        ctx.save();
        ctx.translate(cx, cy - (1 - e) * 0.6);
        ctx.scale(k, k);
        ctx.translate(-cx, -cy);
        drawSnake(ctx, this.staticPts[i], this.colors[l.snakes[i].color], this.theme, { scales, alpha: e });
        ctx.restore();
      }
      if (u >= 1 && allDone) { this.intro = null; this.dirty = true; }
    }

    for (const [i, m] of this.moving) {
      let tau = tick - m.start;
      if (tau < 0) tau = 0;
      const tailEdge = m.L - 1 + m.R + 0.5;
      let alpha = 1;
      if (tau > tailEdge) alpha = Math.max(0, 1 - (tau - tailEdge) / 1.5);
      if (alpha <= 0) continue;
      const pts = slice(m.track, tau, m.L - 1 + tau).reverse();
      const tongue = tau > 0 ? 0.5 + 0.5 * Math.sin(nowMs / 90 + m.phase) : 0;
      drawSnake(ctx, pts, this.colors[this.level.snakes[i].color], this.theme, { scales, alpha, dir: m.dir, tongue });
    }

    const keep = [];
    for (const e of this.effects) {
      const dur = e.kind === 'bump' ? BUMP_MS : e.kind === 'shove' ? SHOVE_MS : RING_MS;
      const u = (nowMs - e.t0) / dur;
      if (u >= 1) {
        if (e.kind === 'bump' || e.kind === 'shove') { this.hidden.delete(e.i); this.dirty = true; }
        continue;
      }
      keep.push(e);
      if (u < 0) {
        if (e.kind === 'shove') drawSnake(ctx, this.staticPts[e.i], this.colors[this.level.snakes[e.i].color], this.theme, { scales });
        continue;
      }
      if (e.kind === 'bump') {
        // lunge forward, hit, then rattle back while flashing red
        const lunge = u < 0.36 ? 0.3 * Math.sin(Math.PI * (u / 0.36)) : 0;
        const pts = slice(e.track, lunge, e.L - 1 + lunge).reverse();
        const shake = u > 0.16 ? Math.sin((u - 0.16) * Math.PI * 12) * 0.13 * (1 - u) : 0;
        const white = u < 0.12 ? u / 0.12 : Math.max(0, 1 - (u - 0.12) / 0.14);
        const red = u < 0.2 ? u / 0.2 : Math.max(0, 1 - (u - 0.2) / 0.8);
        const col = this.flashColors(this.colors[this.level.snakes[e.i].color], white, red);
        ctx.save();
        ctx.translate(-e.dir[1] * shake, e.dir[0] * shake);
        drawSnake(ctx, pts, col, this.theme, { scales, dir: e.dir, squint: Math.min(1, red * 1.4) });
        ctx.restore();
      } else if (e.kind === 'shove') {
        const push = Math.sin(Math.PI * u) * 0.16;
        ctx.save();
        ctx.translate(e.dir[0] * push, e.dir[1] * push);
        drawSnake(ctx, this.staticPts[e.i], this.colors[this.level.snakes[e.i].color], this.theme, { scales });
        ctx.restore();
      } else {
        drawCellRing(ctx, e.x, e.y, this.theme.warn, 1 - u * u, u);
      }
    }
    this.effects = keep;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

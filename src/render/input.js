// Pointer, wheel and keyboard input: taps, drag-pan, pinch zoom, wheel zoom.

const TAP_MOVE = 9;
const TAP_MS = 400;
const DOUBLE_MS = 320;

export class Input {
  constructor(canvas, h) {
    this.canvas = canvas;
    this.h = h;
    this.pointers = new Map();
    this.dragging = false;
    this.pinch = null;
    this.lastTap = null;
    this.gesture = false;

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dblclick', (e) => e.preventDefault());
  }

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  startGesture() {
    if (!this.gesture) { this.gesture = true; this.h.gestureStart(); }
  }
  endGesture() {
    if (this.gesture) { this.gesture = false; this.h.gestureEnd(); }
  }

  down(e) {
    if (e.button !== undefined && e.button > 1) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const [x, y] = this.pos(e);
    this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now() });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.dragging = true;
      this.startGesture();
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const [x, y] = this.pos(e);
    const px = p.x, py = p.y;
    p.x = x; p.y = y;
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (this.pinch.d > 0) this.h.pinch(mx, my, d / this.pinch.d);
      this.h.pan(mx - this.pinch.mx, my - this.pinch.my, true);
      this.pinch = { d, mx, my };
      return;
    }
    if (this.pointers.size === 1) {
      if (!this.dragging && Math.hypot(x - p.sx, y - p.sy) > TAP_MOVE) {
        this.dragging = true;
        this.startGesture();
      }
      if (this.dragging) this.h.pan(x - px, y - py, false);
    }
  }

  up(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    const now = performance.now();
    if (!cancelled && this.pointers.size === 0 && !this.dragging && now - p.t < TAP_MS) {
      const [x, y] = this.pos(e);
      const consumed = this.h.tap(x, y);
      if (!consumed && this.lastTap && now - this.lastTap.t < DOUBLE_MS && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30) {
        this.h.doubleTap(x, y);
        this.lastTap = null;
      } else {
        this.lastTap = consumed ? null : { t: now, x, y };
      }
    }
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.pinch = null;
      this.endGesture();
    } else if (this.pointers.size === 1) {
      this.pinch = null;
      const rest = [...this.pointers.values()][0];
      rest.sx = rest.x; rest.sy = rest.y;
    }
  }

  wheel(e) {
    e.preventDefault();
    const [x, y] = this.pos(e);
    const k = e.ctrlKey ? 0.01 : 0.0018;
    const f = Math.exp(-e.deltaY * k);
    this.h.wheel(x, y, f);
  }
}

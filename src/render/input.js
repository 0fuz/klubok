// Pointer, wheel and keyboard input: taps, drag-pan, pinch zoom, wheel zoom.

// Fingers wobble: a touch may travel ~15-20 css px during a plain tap, a mouse barely moves.
const TAP_MOVE_TOUCH = 22;
const TAP_MOVE_MOUSE = 6;
const TAP_MS = 650;
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
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch {}
    const [x, y] = this.pos(e);
    const touch = e.pointerType !== 'mouse';
    this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now(), touch });
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
      const limit = p.touch ? TAP_MOVE_TOUCH : TAP_MOVE_MOUSE;
      if (!this.dragging && Math.hypot(x - p.sx, y - p.sy) > limit) {
        // only start dragging when there is something to drag; otherwise stay a tap
        if (!this.h.canPan()) return;
        this.dragging = true;
        this.startGesture();
        this.h.pan(x - p.sx, y - p.sy, false);
        return;
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
      // use the touch-down point: it is where the finger aimed, before any wobble
      const x = p.sx, y = p.sy;
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

import { generateLevel } from './core/generator.js';
import { Game, TICK_MS } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { Input } from './render/input.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';
import { loadProgress, saveProgress } from './storage.js';
import { LevelSource } from './levels.js';

const canvas = document.getElementById('board');
const renderer = new Renderer(canvas);
const ui = new UI();
const progress = loadProgress();
const levels = new LevelSource();

let game = null;
let level = null;
let levelNo = progress.level;
let epoch = 0;
let raf = 0;
let finishing = false;
let themePref = progress.theme || 'auto';

const query = new URLSearchParams(location.search);
if (query.get('level')) levelNo = Math.max(1, parseInt(query.get('level'), 10) || 1);

const media = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const effective = themePref === 'auto' ? (media.matches ? 'dark' : 'light') : themePref;
  ui.setTheme(themePref, effective);
  renderer.setTheme(effective);
  requestFrame();
}
media.addEventListener?.('change', applyTheme);

function nowTick() {
  return (performance.now() - epoch) / TICK_MS;
}

let startToken = 0;
async function startLevel(n, { intro = true } = {}) {
  const token = ++startToken;
  levelNo = n;
  finishing = false;
  renderer.resize();
  const aspect = renderer.W / renderer.H;
  const next = await levels.get(n, aspect);
  if (token !== startToken) return;
  level = next;
  game = new Game(level);
  renderer.setLevel(level, game);
  renderer.fit();
  if (intro) renderer.startIntro();
  epoch = performance.now();
  ui.setLevel(n, level);
  ui.setLives(game.lives);
  ui.hideOverlay();
  if (intro) ui.flashLevel(n);
  saveProgress({ level: n });
  requestFrame();
  levels.prefetch(n + 1, aspect);
}

function requestFrame() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function frame() {
  raf = 0;
  if (!game) return;
  const t = nowTick();
  const finished = game.update(t);
  if (finished.length) Sfx.exit();
  renderer.frame(performance.now(), t);
  if (game.won && !finishing) onWin();
  if (renderer.needsFrame()) requestFrame();
}

function onWin() {
  finishing = true;
  Sfx.win();
  ui.toast(`Уровень ${levelNo} пройден`, 1100);
  setTimeout(() => {
    renderer.startOutro();
    requestFrame();
    setTimeout(() => startLevel(levelNo + 1), 400);
  }, 450);
}

function onLose() {
  Sfx.lose();
  ui.showOverlay({
    title: 'Жизни кончились',
    text: `Уровень ${levelNo}. Змейка, которая упирается в другую, теряет жизнь.`,
    button: 'Ещё раз',
    onClick: () => startLevel(levelNo, { intro: false }),
  });
}

const input = new Input(canvas, {
  tap(sx, sy) {
    if (!game || game.over || finishing) return false;
    const [wx, wy] = renderer.screenToWorld(sx, sy);
    const i = game.snakeAt(Math.floor(wx), Math.floor(wy));
    if (i < 0) return false;
    const res = game.tap(i, nowTick());
    if (res.result === 'ok') {
      renderer.startMove(i, game.moving.get(i));
      Sfx.tap();
    } else if (res.result === 'blocked') {
      renderer.bump(i, res);
      ui.setLives(game.lives);
      ui.shakeHearts();
      Sfx.bump();
      try { navigator.vibrate?.(game.over ? [60, 40, 90] : 45); } catch {}
      if (game.over) setTimeout(onLose, 650);
    }
    requestFrame();
    return true;
  },
  doubleTap(sx, sy) {
    if (renderer.cam.scale > renderer.fitScale() * 2.4) renderer.fit();
    else renderer.zoomAt(sx, sy, 2.2);
    requestFrame();
  },
  pan(dx, dy, force) {
    if (force || renderer.isZoomed()) renderer.panBy(dx, dy);
    requestFrame();
  },
  pinch(sx, sy, f) {
    renderer.zoomAt(sx, sy, f);
    requestFrame();
  },
  wheel(sx, sy, f) {
    renderer.zoomAt(sx, sy, f);
    requestFrame();
  },
  gestureStart() { renderer.gesture = true; requestFrame(); },
  gestureEnd() { renderer.gesture = false; renderer.dirty = true; requestFrame(); },
});

function zoomCenter(f) {
  renderer.zoomAt(renderer.W / 2, renderer.H / 2, f);
  requestFrame();
}

document.getElementById('btn-zoom-in').onclick = () => zoomCenter(1.5);
document.getElementById('btn-zoom-out').onclick = () => zoomCenter(1 / 1.5);
document.getElementById('btn-fit').onclick = () => { renderer.fit(); requestFrame(); };
document.getElementById('btn-restart').onclick = () => startLevel(levelNo, { intro: false });
document.getElementById('btn-theme').onclick = () => {
  themePref = themePref === 'auto' ? 'dark' : themePref === 'dark' ? 'light' : 'auto';
  saveProgress({ theme: themePref });
  applyTheme();
};
document.getElementById('btn-help').onclick = () => {
  ui.showOverlay({
    title: 'Клубок',
    html: 'Тапни змейку, и она поползёт вперёд и уйдёт за край поля.<br>Если на пути другая змейка или камень, она ударится и заберёт жизнь.<br>Три жизни на уровень. Освободи всё поле.<br><br>Масштаб: щипок, колесо или двойной тап по пустому месту.',
    button: 'Понятно',
  });
};

window.addEventListener('keydown', (e) => {
  if (e.key === '+' || e.key === '=') zoomCenter(1.5);
  else if (e.key === '-') zoomCenter(1 / 1.5);
  else if (e.key === '0') { renderer.fit(); requestFrame(); }
  else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') startLevel(levelNo, { intro: false });
});

function onResize() {
  if (!game) return;
  const zoomed = renderer.isZoomed();
  renderer.resize();
  if (zoomed) renderer.camChanged(); else renderer.fit();
  requestFrame();
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(canvas);
else window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestFrame(); });

applyTheme();
startLevel(levelNo);

// Dev hooks (?dev): drive the game from the console or from automation.
if (query.has('dev')) {
  window.__klubok = {
    get game() { return game; },
    get level() { return level; },
    renderer, input, ui, frame, startLevel, nowTick, requestFrame,
    setTick(t) { epoch = performance.now() - t * TICK_MS; },
    tapCell(x, y) {
      const c = renderer.cam;
      const sx = (x + 0.5 - c.cx) * c.scale + renderer.W / 2;
      const sy = (y + 0.5 - c.cy) * c.scale + renderer.H / 2;
      return input.h.tap(sx, sy);
    },
    async shot(name) {
      frame();
      await fetch('http://127.0.0.1:8091/shot?name=' + encodeURIComponent(name), { method: 'POST', body: canvas.toDataURL('image/png') });
      return name;
    },
  };
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !query.has('dev')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

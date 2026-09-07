// DOM side panel, hearts, toast and overlays.

export class UI {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.lvl = this.el('lvl');
    this.hearts = [...document.querySelectorAll('#hearts .heart')];
    this.toastEl = this.el('toast');
    this.overlay = this.el('overlay');
    this.ovTitle = this.el('ov-title');
    this.ovText = this.el('ov-text');
    this.ovBtn = this.el('ov-btn');
    this.ovBtn2 = this.el('ov-btn2');
    this.toastTimer = 0;
  }

  setLevel(n, level) {
    this.lvl.textContent = String(n);
    const meta = this.el('meta');
    if (meta) meta.textContent = `${level.w}×${level.h} · ${level.snakes.length}`;
  }

  setLives(n) {
    this.hearts.forEach((h, i) => h.classList.toggle('lost', i >= n));
  }

  shakeHearts() {
    const box = this.el('hearts');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  toast(text, ms = 1400) {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
      setTimeout(() => { this.toastEl.hidden = true; }, 300);
    }, ms);
  }

  showOverlay({ title, text, button, onClick, button2, onClick2, html }) {
    this.ovTitle.textContent = title;
    if (html) this.ovText.innerHTML = html; else this.ovText.textContent = text || '';
    this.ovBtn.textContent = button;
    this.ovBtn.onclick = () => { this.hideOverlay(); onClick?.(); };
    if (button2) {
      this.ovBtn2.hidden = false;
      this.ovBtn2.textContent = button2;
      this.ovBtn2.onclick = () => { this.hideOverlay(); onClick2?.(); };
    } else this.ovBtn2.hidden = true;
    this.overlay.hidden = false;
    this.ovBtn.focus();
  }

  showLevelPicker(current, onPick) {
    const chips = [1, 10, 25, 50, 100, 200, 400].map((n) => `<button class="chip" data-n="${n}">${n}</button>`).join('');
    this.showOverlay({
      title: 'Перейти к уровню',
      html: `<input id="lvl-input" type="number" inputmode="numeric" min="1" max="9999" value="${current}"><div class="chips">${chips}</div>`,
      button: 'Перейти',
      button2: 'Отмена',
      onClick: () => {
        const v = parseInt(this.el('lvl-input').value, 10);
        if (v >= 1) onPick(Math.min(9999, v));
      },
    });
    const input = this.el('lvl-input');
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.ovBtn.click(); });
    this.ovText.querySelectorAll('.chip').forEach((b) => {
      b.onclick = () => { this.hideOverlay(); onPick(Number(b.dataset.n)); };
    });
  }

  flashLevel(n) {
    const el = this.el('level-flash');
    if (!el) return;
    el.textContent = `Уровень ${n}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  hideOverlay() {
    this.overlay.hidden = true;
  }

  setTheme(pref, effective) {
    document.documentElement.dataset.theme = effective;
    const btn = this.el('btn-theme');
    btn.dataset.pref = pref;
    btn.title = pref === 'auto' ? 'Тема: как в системе' : pref === 'dark' ? 'Тема: тёмная' : 'Тема: светлая';
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
  }
}

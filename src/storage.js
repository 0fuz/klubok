const KEY = 'klubok.v1';

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') return { level: 1, theme: 'auto', ...p };
    }
  } catch {}
  return { level: 1, theme: 'auto' };
}

export function saveProgress(patch) {
  try {
    const cur = loadProgress();
    localStorage.setItem(KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {}
}

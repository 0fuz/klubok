// Level source: generates in a Web Worker when available, prefetches the next level,
// falls back to synchronous generation.
import { generateLevel } from './core/generator.js';

const ASPECT_TOLERANCE = 0.25;

export class LevelSource {
  constructor() {
    this.cache = new Map(); // n -> [{ aspect, promise }]
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    try {
      if (typeof Worker !== 'undefined' && location.protocol.startsWith('http')) {
        this.worker = new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => {
          const { id, level, error } = e.data;
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          if (error) p.reject(new Error(error)); else p.resolve(level);
        };
        this.worker.onerror = () => {
          const err = new Error('worker failed');
          for (const p of this.pending.values()) p.reject(err);
          this.pending.clear();
          this.worker = null;
        };
      }
    } catch {
      this.worker = null;
    }
  }

  generate(n, aspect) {
    if (!this.worker) return Promise.resolve(generateLevel(n, aspect));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, level: n, aspect });
    }).catch(() => generateLevel(n, aspect));
  }

  get(n, aspect) {
    const list = this.cache.get(n) || [];
    const hit = list.find((e) => Math.abs(e.aspect - aspect) < ASPECT_TOLERANCE);
    if (hit) return hit.promise;
    const promise = this.generate(n, aspect);
    list.push({ aspect, promise });
    this.cache.set(n, list);
    // keep the cache tiny
    for (const key of this.cache.keys()) if (key < n - 1 || key > n + 2) this.cache.delete(key);
    return promise;
  }

  prefetch(n, aspect) {
    this.get(n, aspect).catch(() => {});
  }
}

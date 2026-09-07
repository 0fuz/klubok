// Level generation off the main thread.
import { generateLevel } from './core/generator.js';

self.onmessage = (e) => {
  const { id, level, aspect } = e.data;
  try {
    self.postMessage({ id, level: generateLevel(level, aspect) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

import chalk from 'chalk';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Human-like delay: uses gaussian distribution instead of uniform random
// Real humans cluster around a center value, not flat random between min/max
export function humanDelay(minMs, maxMs) {
  const mean = (minMs + maxMs) / 2;
  const stddev = (maxMs - minMs) / 6; // 99.7% within range
  let delay = gaussianRandom(mean, stddev);
  delay = Math.max(minMs, Math.min(maxMs, delay));
  // Add occasional "distraction" pauses (5% chance of 2-8x longer, capped at 45s)
  if (Math.random() < 0.05) {
    delay = Math.min(delay * (2 + Math.random() * 6), 45000);
  }
  return sleep(Math.floor(delay));
}

// Gaussian random using Box-Muller transform
function gaussianRandom(mean, stddev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// Legacy wrapper
export const randomDelay = (min, max) => humanDelay(min, max);

// Simulates reading time based on text length
export function readingDelay(text) {
  if (!text) return sleep(1000);
  // Average reading speed: ~250 words per minute = ~4 words per second
  const words = text.split(/\s+/).length;
  const readTimeMs = (words / 4) * 1000;
  // Add some randomness
  return humanDelay(readTimeMs * 0.8, readTimeMs * 1.5 + 1000);
}

export const log = {
  dino: (msg) => console.log(chalk.green(`🦕 ${msg}`)),
  like: (msg) => console.log(chalk.magenta(`💚 ${msg}`)),
  pass: (msg) => console.log(chalk.yellow(`💛 ${msg}`)),
  info: (msg) => console.log(chalk.blue(`ℹ️  ${msg}`)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`⚠️  ${msg}`)),
};

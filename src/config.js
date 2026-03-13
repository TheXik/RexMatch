import dotenv from 'dotenv';
dotenv.config();

// Parse integer with a true fallback (avoids 0 being silently ignored by || default)
const int = (val, fallback) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
};

const float = (val, fallback) => {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  tinder: {
    url: 'https://tinder.com',
  },
  swipe: {
    limit: int(process.env.SWIPE_LIMIT, 40),
    delayMin: int(process.env.SWIPE_DELAY_MIN, 3000),
    delayMax: int(process.env.SWIPE_DELAY_MAX, 8000),
    likeRatio: float(process.env.LIKE_RATIO, 0.35),
  },
  browser: {
    sessionDir: process.env.SESSION_DIR || 'sessions/browser',
    locale: process.env.BROWSER_LOCALE || 'cs-CZ',
    timezone: process.env.BROWSER_TIMEZONE || 'Europe/Prague',
  },
  ai: {
    claudeUrl: 'https://claude.ai',
    yourName: process.env.YOUR_NAME || 'Rex',
    yourAge: int(process.env.YOUR_AGE, 21),
    yourTinderName: process.env.YOUR_TINDER_NAME || process.env.YOUR_NAME || 'Rex',
    yourCity: process.env.YOUR_CITY || 'Prague',
    yourBio: process.env.YOUR_BIO || '',
    openerStyle: process.env.OPENER_STYLE || 'witty',
  },
  debug: {
    screenshots: process.env.DEBUG_SCREENSHOTS === 'true',
  },
};

// Validate config at startup
if (config.swipe.delayMin > config.swipe.delayMax) {
  throw new Error(`Config error: SWIPE_DELAY_MIN (${config.swipe.delayMin}) must be <= SWIPE_DELAY_MAX (${config.swipe.delayMax})`);
}

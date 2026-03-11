import dotenv from 'dotenv';
dotenv.config();

export const config = {
  tinder: {
    url: 'https://tinder.com',
    email: process.env.TINDER_EMAIL,
    password: process.env.TINDER_PASSWORD,
    sessionFile: process.env.SESSION_FILE || 'sessions/tinder_session.json',
  },
  swipe: {
    limit: parseInt(process.env.SWIPE_LIMIT) || 100,
    delayMin: parseInt(process.env.SWIPE_DELAY_MIN) || 1500,
    delayMax: parseInt(process.env.SWIPE_DELAY_MAX) || 4000,
    likeRatio: parseFloat(process.env.LIKE_RATIO) || 0.7,
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-opus-4-6',
    yourName: process.env.YOUR_NAME || 'Rex',
    yourBio: process.env.YOUR_BIO || '',
    openerStyle: process.env.OPENER_STYLE || 'witty',
  },
};

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
    limit: parseInt(process.env.SWIPE_LIMIT) || 40,         // Safe default: 40 per session
    delayMin: parseInt(process.env.SWIPE_DELAY_MIN) || 3000,  // 3 seconds min between swipes
    delayMax: parseInt(process.env.SWIPE_DELAY_MAX) || 8000,  // 8 seconds max
    likeRatio: parseFloat(process.env.LIKE_RATIO) || 0.35,    // 35% like rate (realistic)
  },
  ai: {
    claudeUrl: 'https://claude.ai',
    yourName: process.env.YOUR_NAME || 'Rex',
    yourBio: process.env.YOUR_BIO || '',
    openerStyle: process.env.OPENER_STYLE || 'witty',
  },
};

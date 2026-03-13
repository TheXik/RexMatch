import fs from 'fs/promises';
import { config } from './config.js';
import { log, sleep, humanDelay } from './utils.js';

// Tinder limits: ~100 likes per 12 hours (free), ~200 (Gold/Platinum)
const SAFE_SESSION_LIMIT = 40; // Never swipe more than 40 in one sitting
const SESSION_BREAK_MIN = 15 * 60 * 1000; // 15 min break between sessions
const SESSION_BREAK_MAX = 45 * 60 * 1000; // 45 min break

export class Swiper {
  constructor(page, analyzer = null) {
    this.page = page;
    this.analyzer = analyzer;
    this.liked = 0;
    this.passed = 0;
    this.errors = 0;
    this.consecutiveErrors = 0;
    this.sessionSwipes = 0;
    this.outOfLikes = false;
  }

  async swipe(count = config.swipe.limit) {
    const smart = !!this.analyzer;
    // Cap total swipes to prevent ban
    const safeCount = Math.min(count, 80);
    if (count > 80) {
      log.warn(`Capped swipes from ${count} to ${safeCount} to avoid ban`);
    }

    log.dino(`Rex starting to swipe! Target: ${safeCount} profiles ${smart ? '(SMART MODE 🧠)' : '(random mode)'} 🦕`);

    for (let i = 0; i < safeCount; i++) {
      // Session break every 25-40 swipes (randomized)
      if (this.sessionSwipes >= SAFE_SESSION_LIMIT - Math.floor(Math.random() * 15)) {
        const breakTime = Math.floor(Math.random() * (SESSION_BREAK_MAX - SESSION_BREAK_MIN)) + SESSION_BREAK_MIN;
        log.info(`Taking a break for ${Math.round(breakTime / 60000)} minutes (like a real person)...`);
        await sleep(breakTime);
        this.sessionSwipes = 0;
      }

      try {
        await this.#dismissPopups();
        if (this.outOfLikes) break;

        // Simulate looking at the profile (scroll through photos, read bio)
        await this.#simulateProfileViewing();

        let shouldLike, profile, reason;

        if (smart) {
          const result = await this.analyzer.shouldLike();
          shouldLike = result.decision;
          profile = result.profile;
          reason = result.reason;
        } else {
          profile = await this.#getProfileInfo();
          shouldLike = Math.random() < config.swipe.likeRatio;
          reason = 'random';
        }

        // Human-like pre-action delay (thinking time after looking at profile)
        await humanDelay(800, 2500);

        if (shouldLike) {
          await this.#like();
          this.liked++;
          log.like(`Liked ${profile?.name || 'someone'} (${this.liked} total) — ${reason}`);
        } else {
          await this.#pass();
          this.passed++;
          log.pass(`Passed ${profile?.name || 'someone'} (${this.passed} total) — ${reason}`);
        }

        this.sessionSwipes++;
        this.consecutiveErrors = 0;

        // Human-like delay between swipes (gaussian distribution, 3-8 seconds typical)
        await humanDelay(
          config.swipe.delayMin,
          config.swipe.delayMax
        );
      } catch (err) {
        this.errors++;
        this.consecutiveErrors++;
        log.error(`Swipe error: ${err.message}`);

        if (this.consecutiveErrors >= 3) {
          // Probably rate-limited or something's wrong
          const backoff = Math.min(this.consecutiveErrors * 30000, 300000); // Up to 5 min
          log.warn(`${this.consecutiveErrors} errors in a row — backing off for ${Math.round(backoff / 1000)}s`);
          await sleep(backoff);
        }

        if (this.consecutiveErrors >= 8) {
          log.error('Too many consecutive errors. Stopping to protect account.');
          break;
        }

        await humanDelay(3000, 8000);
      }
    }

    log.dino(`Swiping done! Liked: ${this.liked} | Passed: ${this.passed} 🦕`);
    await this.#logSession(smart ? 'smart' : 'random');
    return { liked: this.liked, passed: this.passed };
  }

  // Simulate a human looking at a profile before deciding
  async #simulateProfileViewing() {
    // Wait for profile to load
    await humanDelay(1000, 2000);

    // Sometimes scroll down to see bio/interests (40% of the time)
    if (Math.random() < 0.4) {
      await this.page.keyboard.press('ArrowDown');
      await humanDelay(1500, 4000); // Reading bio
      await this.page.keyboard.press('ArrowUp');
      await humanDelay(500, 1000);
    }

    // Sometimes click through photos (30% of the time)
    if (Math.random() < 0.3) {
      const photoClicks = 1 + Math.floor(Math.random() * 3); // 1-3 photos
      for (let p = 0; p < photoClicks; p++) {
        await this.page.keyboard.press('Space'); // Space advances photos on Tinder
        await humanDelay(1000, 3000); // Look at each photo
      }
    }
  }

  async #like() {
    // Only use keyboard (most natural)
    await this.page.keyboard.press('ArrowRight');
    // Small delay to let animation complete
    await humanDelay(400, 800);
  }

  async #pass() {
    await this.page.keyboard.press('ArrowLeft');
    await humanDelay(400, 800);
  }

  async #getProfileInfo() {
    try {
      const nameEl = await this.page.$('h1');
      const name = nameEl ? await nameEl.textContent() : null;
      return { name: name?.trim() };
    } catch {
      return null;
    }
  }

  async #logSession(mode) {
    try {
      await fs.mkdir('data', { recursive: true });
      const entry = JSON.stringify({
        date: new Date().toISOString(),
        mode,
        liked: this.liked,
        passed: this.passed,
        errors: this.errors,
      });
      await fs.appendFile('data/sessions.log', entry + '\n');
    } catch {
      // Non-critical — don't crash the bot over a log write
    }
  }

  async #dismissPopups() {
    // Detect "out of likes" paywall first — no point retrying swipes
    const outOfLikesEl = await this.page.$('[class*="likesExhausted"], [data-testid="out-of-likes"], [class*="outOfLikes"]').catch(() => null);
    if (outOfLikesEl) {
      log.warn('Out of likes for today. Stopping session to protect account.');
      this.outOfLikes = true;
      return;
    }

    const selectors = [
      '[aria-label="Back to Tinder"]',
      'button[title="Not interested"]',
      '[data-testid="dialog-close-button"]',
      '.modal [aria-label="Close"]',
    ];

    for (const sel of selectors) {
      const el = await this.page.$(sel).catch(() => null);
      if (el) {
        await humanDelay(500, 1500); // Read popup before dismissing
        await el.click().catch(() => {});
        await humanDelay(300, 600);
        break; // Re-evaluate after each click
      }
    }
  }
}

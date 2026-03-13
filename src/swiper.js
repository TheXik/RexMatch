import fs from 'fs/promises';
import { config } from './config.js';
import { log, sleep, humanDelay } from './utils.js';

// Tinder limits: ~100 likes per 12 hours (free), ~200 (Gold/Platinum)
const SAFE_SESSION_LIMIT = 40;
const SESSION_BREAK_MIN = 15 * 60 * 1000;
const SESSION_BREAK_MAX = 45 * 60 * 1000;

// All dismiss selectors in priority order
const POPUP_SELECTORS = [
  '[data-testid="match-close-button"]',       // "It's a match!" overlay
  '[aria-label="Back to Tinder"]',             // match overlay back button
  '[data-testid="dialog-close-button"]',
  '[aria-label="Close"]',
  'button[title="Not interested"]',
  '[aria-label="Not interested"]',
  '[aria-label="Ignore"]',
  '[aria-label="Maybe Later"]',
  'button:has-text("No Thanks")',
  'button:has-text("No thanks")',
  'button:has-text("Not interested")',
  'button:has-text("Maybe Later")',
  'button:has-text("Later")',
  '[class*="appBanner"] button',               // app install banner
];

// Selectors that indicate a swipeable profile card is present
const PROFILE_CARD_SELECTORS = [
  '[data-testid="rec-card"]',
  '[aria-label="Like"]',
  '[aria-label="Nope"]',
  '[class*="recsCard"]',
  '[class*="cardContent"]',
  '[class*="recCard"]',
];

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
    const safeCount = Math.min(count, 80);
    if (count > 80) log.warn(`Capped swipes from ${count} to ${safeCount} to avoid ban`);

    log.dino(`Rex starting to swipe! Target: ${safeCount} profiles ${smart ? '(SMART MODE 🧠)' : '(random mode)'} 🦕`);

    for (let i = 0; i < safeCount; i++) {
      // Session break every 25-40 swipes
      if (this.sessionSwipes >= SAFE_SESSION_LIMIT - Math.floor(Math.random() * 15)) {
        const breakTime = Math.floor(Math.random() * (SESSION_BREAK_MAX - SESSION_BREAK_MIN)) + SESSION_BREAK_MIN;
        log.info(`Taking a break for ${Math.round(breakTime / 60000)} minutes (like a real person)...`);
        await sleep(breakTime);
        this.sessionSwipes = 0;
      }

      try {
        await this.#dismissPopups();
        if (this.outOfLikes) break;

        // Wait for a profile card to actually be present before trying to swipe
        const profileReady = await this.#waitForProfile();
        if (!profileReady) {
          log.warn('No profile card found — waiting and retrying...');
          await humanDelay(5000, 10000);
          await this.#dismissPopups();
          // Try once more; if still nothing, increment error counter
          const retryReady = await this.#waitForProfile(8000);
          if (!retryReady) {
            this.errors++;
            this.consecutiveErrors++;
            continue;
          }
        }

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

        // Human-like thinking pause after looking at profile
        await humanDelay(800, 2500);

        if (shouldLike) {
          const ok = await this.#like();
          if (ok) {
            this.liked++;
            log.like(`Liked ${profile?.name || 'someone'} (${this.liked} total) — ${reason}`);
          }
        } else {
          const ok = await this.#pass();
          if (ok) {
            this.passed++;
            log.pass(`Passed ${profile?.name || 'someone'} (${this.passed} total) — ${reason}`);
          }
        }

        this.sessionSwipes++;
        this.consecutiveErrors = 0;

        // Human-like delay between swipes (gaussian, 3-8s typical)
        await humanDelay(config.swipe.delayMin, config.swipe.delayMax);
      } catch (err) {
        this.errors++;
        this.consecutiveErrors++;
        log.error(`Swipe error: ${err.message}`);

        if (this.consecutiveErrors >= 3) {
          const backoff = Math.min(this.consecutiveErrors * 30000, 300000);
          log.warn(`${this.consecutiveErrors} errors in a row — backing off ${Math.round(backoff / 1000)}s`);
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

  // Wait until a swipeable profile card is visible
  async #waitForProfile(timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const sel of PROFILE_CARD_SELECTORS) {
        const el = await this.page.$(sel).catch(() => null);
        if (el && await el.isVisible().catch(() => false)) return true;
      }
      await sleep(500);
    }
    return false;
  }

  // Simulate a human looking at a profile before deciding
  async #simulateProfileViewing() {
    await humanDelay(800, 2000); // Initial look at first photo

    // 40% chance: browse through photos by clicking right side of card
    if (Math.random() < 0.4) {
      await this.#browsePhotos();
    }

    // 30% chance: scroll down to read bio
    if (Math.random() < 0.3) {
      await this.page.mouse.wheel(0, 250);
      await humanDelay(1500, 3500);
      await this.page.mouse.wheel(0, -250);
      await humanDelay(400, 800);
    }

    // Small random mouse movement (looks human, not a robot)
    const vp = this.page.viewportSize();
    if (vp) {
      const x = 350 + Math.random() * 450;
      const y = 150 + Math.random() * 300;
      await this.page.mouse.move(x, y, { steps: 8 });
    }
  }

  // Click through photos using mouse (Space/keyboard doesn't work on Tinder)
  async #browsePhotos() {
    const cardEl = await this.page.$(
      '[data-testid="rec-card"], [class*="recsCard"], [class*="recCard"], [class*="profileCard"]'
    ).catch(() => null);
    if (!cardEl) return;

    const box = await cardEl.boundingBox().catch(() => null);
    if (!box || box.width < 100) return;

    const photoCount = 1 + Math.floor(Math.random() * 3); // 1-3 extra photos
    for (let p = 0; p < photoCount; p++) {
      // Click the right 35-90% of the card width to advance to next photo
      const clickX = box.x + box.width * (0.6 + Math.random() * 0.3);
      const clickY = box.y + box.height * (0.2 + Math.random() * 0.5);
      await this.page.mouse.click(clickX, clickY);
      await humanDelay(700, 2000);
    }
  }

  // Like: keyboard shortcut with button fallback + swipe verification
  async #like() {
    const nameBefore = await this.#getProfileName();

    // Blur any focused element so keyboard shortcuts reach the page
    await this.page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await humanDelay(100, 250);

    await this.page.keyboard.press('ArrowRight');
    await humanDelay(600, 1200);

    // Verify the profile actually changed
    const nameAfter = await this.#getProfileName();
    if (nameAfter !== nameBefore) return true;

    // Keyboard didn't work — click the Like button directly
    log.info('Keyboard like failed, trying button click...');
    const likeBtn = await this.page.$(
      '[aria-label="Like"], [data-testid="swipe-right-button"], button[title="Like"]'
    ).catch(() => null);
    if (likeBtn && await likeBtn.isVisible().catch(() => false)) {
      await likeBtn.click({ force: true }).catch(() => {});
      await humanDelay(600, 1200);
      return true;
    }

    log.warn('Could not perform like — no button found');
    return false;
  }

  // Pass: keyboard shortcut with button fallback + swipe verification
  async #pass() {
    const nameBefore = await this.#getProfileName();

    await this.page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await humanDelay(100, 250);

    await this.page.keyboard.press('ArrowLeft');
    await humanDelay(600, 1200);

    const nameAfter = await this.#getProfileName();
    if (nameAfter !== nameBefore) return true;

    // Keyboard didn't work — click the Nope button directly
    log.info('Keyboard pass failed, trying button click...');
    const nopeBtn = await this.page.$(
      '[aria-label="Nope"], [data-testid="swipe-left-button"], button[title="Nope"]'
    ).catch(() => null);
    if (nopeBtn && await nopeBtn.isVisible().catch(() => false)) {
      await nopeBtn.click({ force: true }).catch(() => {});
      await humanDelay(600, 1200);
      return true;
    }

    log.warn('Could not perform pass — no button found');
    return false;
  }

  async #getProfileName() {
    try {
      // Try multiple selectors, return first non-empty result
      const selectors = [
        '[data-testid="name"]',
        'h1',
        '[class*="profileName" i]',
        '[class*="name" i] span',
      ];
      for (const sel of selectors) {
        const text = await this.page.$eval(sel, (el) => el.textContent?.trim() || '').catch(() => '');
        if (text) return text;
      }
      return '';
    } catch {
      return '';
    }
  }

  async #getProfileInfo() {
    return { name: await this.#getProfileName() };
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
      // Non-critical — don't crash over a log write
    }
  }

  async #dismissPopups() {
    // Check for "out of likes" paywall first
    const outOfLikesEl = await this.page.$(
      '[class*="likesExhausted"], [data-testid="out-of-likes"], [class*="outOfLikes"]'
    ).catch(() => null);
    if (outOfLikesEl) {
      log.warn('Out of likes for today. Stopping session to protect account.');
      this.outOfLikes = true;
      return;
    }

    // Loop up to 5 rounds — dismissing one popup can reveal another
    for (let round = 0; round < 5; round++) {
      let dismissed = false;

      for (const sel of POPUP_SELECTORS) {
        const el = await this.page.$(sel).catch(() => null);
        if (!el) continue;
        if (!await el.isVisible().catch(() => false)) continue;

        await humanDelay(400, 1000); // "read" the popup briefly
        await el.click({ force: true }).catch(() => {});
        await humanDelay(400, 800);
        dismissed = true;
        break; // Re-evaluate from scratch after each dismissal
      }

      if (!dismissed) {
        // Try Escape once as a last resort (closes modals/overlays)
        await this.page.keyboard.press('Escape').catch(() => {});
        await humanDelay(300, 500);
        break;
      }
    }
  }
}

import { config } from './config.js';
import { log, sleep, randomDelay } from './utils.js';

export class Swiper {
  constructor(page) {
    this.page = page;
    this.liked = 0;
    this.passed = 0;
    this.errors = 0;
  }

  async swipe(count = config.swipe.limit) {
    log.dino(`Rex starting to swipe! Target: ${count} profiles 🦕`);

    for (let i = 0; i < count; i++) {
      try {
        await this.#dismissPopups();
        const profile = await this.#getProfileInfo();

        const shouldLike = Math.random() < config.swipe.likeRatio;

        if (shouldLike) {
          await this.#like();
          this.liked++;
          log.like(`Liked ${profile?.name || 'someone'} (${this.liked} likes total)`);
        } else {
          await this.#pass();
          this.passed++;
          log.pass(`Passed on ${profile?.name || 'someone'} (${this.passed} passes total)`);
        }

        await randomDelay(config.swipe.delayMin, config.swipe.delayMax);
      } catch (err) {
        this.errors++;
        log.error(`Swipe error: ${err.message}`);
        await sleep(3000);

        if (this.errors > 5) {
          log.error('Too many errors, pausing for 30s...');
          await sleep(30000);
          this.errors = 0;
        }
      }
    }

    log.dino(`Swiping done! Liked: ${this.liked} | Passed: ${this.passed} 🦕`);
    return { liked: this.liked, passed: this.passed };
  }

  async #like() {
    // Try keyboard shortcut first (most reliable)
    await this.page.keyboard.press('ArrowRight');
    // Fallback: click the like button
    const likeBtn = await this.page.$('[aria-label="Like"]');
    if (likeBtn) await likeBtn.click();
  }

  async #pass() {
    await this.page.keyboard.press('ArrowLeft');
    const passBtn = await this.page.$('[aria-label="Nope"]');
    if (passBtn) await passBtn.click();
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

  async #dismissPopups() {
    const selectors = [
      '[aria-label="Back to Tinder"]',
      "button[title=\"Not interested\"]",
      '[data-testid="dialog-close-button"]',
      '.modal [aria-label="Close"]',
    ];

    for (const sel of selectors) {
      const el = await this.page.$(sel).catch(() => null);
      if (el) {
        await el.click().catch(() => {});
        await sleep(300);
      }
    }
  }
}

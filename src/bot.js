import { chromium } from 'playwright';
import { config } from './config.js';
import { log, sleep, randomDelay } from './utils.js';
import fs from 'fs/promises';
import path from 'path';

export class RexMatchBot {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    log.dino('RexMatch waking up... RAWR! 🦕');

    this.browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    const sessionExists = await this.#sessionExists();

    this.context = await chromium.launchPersistentContext(
      path.resolve('sessions/browser'),
      {
        headless: false,
        viewport: { width: 1280, height: 800 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      }
    );

    this.page = this.context.pages()[0] || (await this.context.newPage());

    // Stealth: remove webdriver property
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    log.success('Browser ready');
  }

  async login() {
    log.dino('Heading to Tinder...');
    await this.page.goto(config.tinder.url, { waitUntil: 'networkidle' });
    await sleep(2000);

    // Check if already logged in
    const isLoggedIn = await this.page.$('[aria-label="Like"]').catch(() => null);
    if (isLoggedIn) {
      log.success('Already logged in!');
      return;
    }

    log.info('Please log in to Tinder manually in the browser window.');
    log.info('RexMatch will wait for you... (up to 2 minutes)');

    // Wait for the user to log in manually (look for swipe cards)
    try {
      await this.page.waitForSelector('[data-testid="swipe-card"]', {
        timeout: 120000,
      });
      log.success('Login detected! Rex is ready to hunt! 🦕');
    } catch {
      // Try alternative selectors
      await this.page.waitForSelector('.gamepad-button', { timeout: 30000 });
      log.success('Logged in!');
    }
  }

  async dismissPopups() {
    const dismissSelectors = [
      '[aria-label="Allow"]',
      'button[title="Not interested"]',
      '[aria-label="Ignore"]',
      '.modal button:last-child',
    ];

    for (const sel of dismissSelectors) {
      const el = await this.page.$(sel);
      if (el) {
        await el.click().catch(() => {});
        await sleep(500);
      }
    }
  }

  async close() {
    await this.context?.close();
    log.dino('Rex is going to sleep. ZZZZZ... 🦕💤');
  }

  async #sessionExists() {
    try {
      await fs.access('sessions/browser');
      return true;
    } catch {
      await fs.mkdir('sessions/browser', { recursive: true });
      return false;
    }
  }
}

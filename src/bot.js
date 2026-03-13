import { chromium } from 'playwright';
import { config } from './config.js';
import { log, sleep, humanDelay } from './utils.js';
import fs from 'fs/promises';
import path from 'path';

export class RexMatchBot {
  constructor() {
    this.context = null;
    this.page = null;
  }

  async init() {
    log.dino('RexMatch waking up... RAWR! 🦕');

    await this.#ensureSessionDir();

    this.context = await chromium.launchPersistentContext(
      path.resolve(config.browser.sessionDir),
      {
        headless: false,
        viewport: { width: 1280, height: 800 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: config.browser.locale,
        timezoneId: config.browser.timezone,
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
        ],
      }
    );

    this.page = this.context.pages()[0] || (await this.context.newPage());

    // Full stealth: hide all automation signals
    await this.page.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Hide automation-related properties
      delete navigator.__proto__.webdriver;

      // Fake plugins array (real Chrome has plugins)
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
      });

      // Fake languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['cs-CZ', 'cs', 'en-US', 'en'],
      });

      // Override permissions query
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);

      // Spoof chrome object
      window.chrome = { runtime: {} };

      // Prevent canvas fingerprint detection
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (type) {
        if (type === 'image/png') {
          const ctx = this.getContext('2d');
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            // Add tiny noise to prevent exact fingerprint matching
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] += Math.random() < 0.01 ? 1 : 0;
            }
            ctx.putImageData(imageData, 0, 0);
          }
        }
        return originalToDataURL.apply(this, arguments);
      };
    });

    log.success('Browser ready (stealth mode active)');
  }

  async login() {
    log.dino('Heading to Tinder...');
    await this.page.goto(config.tinder.url, { waitUntil: 'networkidle' });
    await humanDelay(2000, 4000);

    // Check URL first (most reliable)
    if (this.page.url().includes('/app/')) {
      log.success('Already logged in!');
      return;
    }

    // Check for logged-in UI elements
    const loggedInSelectors = [
      '[aria-label="Like"]',
      '[aria-label="Nope"]',
      'a[href="/app/messages"]',
      'a[href="/app/recs"]',
      'a[href="/app/profile"]',
    ];

    for (const sel of loggedInSelectors) {
      const el = await this.page.$(sel).catch(() => null);
      if (el) {
        log.success('Already logged in!');
        return;
      }
    }

    log.info('Please log in to Tinder manually in the browser window.');
    log.info('RexMatch will wait for you... (up to 3 minutes)');

    try {
      await this.page.waitForURL('**/app/**', { timeout: 180000 });
      log.success('Login detected! Rex is ready to hunt! 🦕');
    } catch {
      log.error('Login timed out. Please restart and try again.');
      throw new Error('Login timeout');
    }

    await humanDelay(3000, 5000);
  }

  async dismissPopups() {
    // Wait a bit like a human would before dismissing
    await humanDelay(800, 2000);

    const dismissSelectors = [
      'button[title="Not interested"]',
      '[aria-label="Not interested"]',
      '[aria-label="Allow"]',
      '[aria-label="Ignore"]',
      '[aria-label="Maybe Later"]',
    ];

    for (const sel of dismissSelectors) {
      const el = await this.page.$(sel).catch(() => null);
      if (el) {
        await humanDelay(500, 1500); // Read the popup first
        await el.click().catch(() => {});
        await humanDelay(300, 800);
        break; // Re-evaluate from scratch after each dismissal
      }
    }
  }

  // Navigate like a real user — click UI elements, not goto URLs
  async navigateToRecs() {
    // Try clicking the flame/discover icon in the nav bar
    const navLink = await this.#findNavLink(['recs', 'discover', 'explore']);
    if (navLink) {
      await navLink.click();
    } else {
      await this.page.goto('https://tinder.com/app/recs', { waitUntil: 'networkidle' });
    }
    await humanDelay(2000, 4000);
  }

  async navigateToMessages() {
    // Try clicking the messages icon in the nav bar
    const navLink = await this.#findNavLink(['matches', 'messages', 'chat']);
    if (navLink) {
      await navLink.click();
    } else {
      // Try multiple possible URLs
      const urls = [
        'https://tinder.com/app/matches',
        'https://tinder.com/app/recs',
      ];
      for (const url of urls) {
        await this.page.goto(url, { waitUntil: 'networkidle' });
        await humanDelay(2000, 3000);
        // Check if we can see a messages/matches tab
        const msgsTab = await this.page.$('a[href*="matches"], button:has-text("Messages"), [aria-label*="Messages"]').catch(() => null);
        if (msgsTab) {
          await msgsTab.click();
          break;
        }
      }
    }
    await humanDelay(2000, 4000);
  }

  async #findNavLink(keywords) {
    // Search for nav links by href or aria-label
    const links = await this.page.$$('nav a, a[href*="/app/"]');
    for (const link of links) {
      const href = await link.getAttribute('href').catch(() => '');
      const label = await link.getAttribute('aria-label').catch(() => '');
      const text = await link.textContent().catch(() => '');
      const combined = `${href} ${label} ${text}`.toLowerCase();
      if (keywords.some((k) => combined.includes(k))) {
        return link;
      }
    }
    return null;
  }

  async close() {
    await this.context?.close();
    log.dino('Rex is going to sleep. ZZZZZ... 🦕💤');
  }

  async #ensureSessionDir() {
    await fs.mkdir(path.resolve(config.browser.sessionDir), { recursive: true });
  }
}

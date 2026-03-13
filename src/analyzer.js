import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { log, sleep } from './utils.js';

const PREFS_FILE = path.resolve('data/preferences.json');
const SCREENSHOTS_DIR = path.resolve('data/screenshots');

export class ProfileAnalyzer {
  constructor(tinderPage, browserContext) {
    this.page = tinderPage;
    this.context = browserContext;
    this.preferences = { liked: [], passed: [], totalTrained: 0 };
  }

  async init() {
    await fs.mkdir('data/screenshots', { recursive: true });
    await this.#loadPreferences();

    log.dino('Smart mode loaded — rules-based swiping (no Claude needed for decisions) 🦕🧠');
    log.info('Rules: AUTO-LIKE if looking for short-term/long-term fun, fitness interests');
    log.info('Rules: PASS if "just friends" / "no hookups"');
    log.info('Rules: LIKE by default if no "Looking for" tags');
    return true;
  }

  // ──────────────────────────────────────
  // TRAINING MODE — you swipe, Rex learns
  // ──────────────────────────────────────

  async train(count = 20) {
    log.dino(`Training mode! Swipe ${count} profiles manually — Rex is watching and learning 🦕🧠`);
    log.info('Use ArrowRight to LIKE, ArrowLeft to PASS. Rex will remember your taste.\n');

    await this.page.bringToFront();

    for (let i = 0; i < count; i++) {
      const profile = await this.#scrapeProfile();
      const screenshotPath = await this.#screenshotProfile(i);

      log.info(`[${i + 1}/${count}] ${profile.name || 'Unknown'}, ${profile.age || '?'} — ${profile.bio?.substring(0, 60) || 'no bio'}...`);
      log.info('  → Swipe RIGHT (like) or LEFT (pass)...');

      // Wait for the user to swipe
      const decision = await this.#waitForSwipe();

      const entry = {
        ...profile,
        screenshot: screenshotPath,
        decision,
        timestamp: new Date().toISOString(),
      };

      if (decision === 'like') {
        this.preferences.liked.push(entry);
        log.like(`  Noted: you LIKED ${profile.name || 'her'}`);
      } else {
        this.preferences.passed.push(entry);
        log.pass(`  Noted: you PASSED on ${profile.name || 'her'}`);
      }

      this.preferences.totalTrained++;
      await sleep(500);
    }

    await this.#savePreferences();
    log.dino(`Training complete! Rex learned from ${count} swipes 🦕🧠`);
    log.info(`Total trained: ${this.preferences.totalTrained} | Liked: ${this.preferences.liked.length} | Passed: ${this.preferences.passed.length}`);
  }

  // ──────────────────────────────────────
  // SMART SWIPE — rule-based + Claude
  // ──────────────────────────────────────

  // "Looking for" values that mean AUTO-LIKE
  static GOOD_LOOKING_FOR = [
    'short-term fun',
    'short-term, open to long',
    'long-term, open to short',
    'long-term partner',
    'open to short',
    'open to long',
  ];

  // Instant-reject signals
  static REJECT_SIGNALS = [
    'just here for friends',
    'friends only',
    'not looking for hookups',
    'no hookups',
    'just friends',
  ];

  async shouldLike() {
    const profile = await this.#scrapeProfile();
    if (config.debug.screenshots) {
      await this.#screenshotProfile(Date.now());
    }

    // ── RULE 1: Check "Looking for" tags (highest priority) ──
    if (profile.lookingFor && profile.lookingFor.length > 0) {
      const lookingLower = profile.lookingFor.map((l) => l.toLowerCase());

      const hasGoodIntent = lookingLower.some((l) =>
        ProfileAnalyzer.GOOD_LOOKING_FOR.some((g) => l.includes(g))
      );

      if (hasGoodIntent) {
        return { decision: true, profile, reason: `AUTO-LIKE: looking for "${profile.lookingFor.join(', ')}"` };
      }
    }

    // ── RULE 2: Bio reject signals ──
    if (profile.bio) {
      const bioLower = profile.bio.toLowerCase();
      const hasReject = ProfileAnalyzer.REJECT_SIGNALS.some((s) => bioLower.includes(s));
      if (hasReject) {
        return { decision: false, profile, reason: `PASS: bio says "${profile.bio.substring(0, 50)}"` };
      }
    }

    // ── RULE 3: Interests that suggest gym / fitness = auto-like ──
    if (profile.interests && profile.interests.length > 0) {
      const interestsLower = profile.interests.map((i) => i.toLowerCase());
      const fitnessKeywords = ['gym', 'fitness', 'crossfit', 'yoga', 'running', 'working out', 'sports', 'hiking'];
      const hasFitness = interestsLower.some((i) =>
        fitnessKeywords.some((f) => i.includes(f))
      );
      if (hasFitness) {
        return { decision: true, profile, reason: `AUTO-LIKE: fitness interest "${profile.interests.join(', ')}"` };
      }
    }

    // ── RULE 4: If no "Looking for" data, fall back to configured like ratio ──
    if (!profile.lookingFor || profile.lookingFor.length === 0) {
      const shouldLike = Math.random() < config.swipe.likeRatio;
      return {
        decision: shouldLike,
        profile,
        reason: shouldLike ? 'LIKE: no tags (ratio)' : 'PASS: no tags (ratio)',
      };
    }

    // ── FALLBACK: like (has "Looking for" tags that passed all checks) ──
    return { decision: true, profile, reason: 'LIKE: passed all checks' };
  }

  // ──────────────────────────────────────
  // PROFILE SCRAPING
  // ──────────────────────────────────────

  async #scrapeProfile() {
    try {
      // Scrape everything from the visible profile card using page.evaluate
      // This is more reliable than individual selectors
      const profile = await this.page.evaluate(() => {
        const getText = (sel) => {
          const el = document.querySelector(sel);
          return el ? el.textContent?.trim() : null;
        };

        const getAllText = (sel) => {
          const els = document.querySelectorAll(sel);
          return Array.from(els).map((e) => e.textContent?.trim()).filter(Boolean);
        };

        // Name + age from the header
        const headerEl = document.querySelector('h1, [itemprop="name"], [class*="display-1"]');
        let name = null;
        let age = null;
        if (headerEl) {
          const text = headerEl.textContent?.trim();
          // Tinder shows "Name Age" like "Ali 20"
          const match = text?.match(/^(.+?)\s*(\d{2})$/);
          if (match) {
            name = match[1].trim();
            age = match[2];
          } else {
            name = text;
          }
        }

        // Bio
        const bio = getText('[class*="BreakWord"]')
          || getText('[class*="body-1-regular"]')
          || null;

        // Distance
        const distance = getText('[class*="distance"]')
          || getText('[class*="Mstart"]')
          || null;

        // Interests / passions (pill-shaped tags)
        const interests = getAllText('[class*="Bdrs(100px)"]')
          .concat(getAllText('[class*="pill"]'))
          .concat(getAllText('[class*="passion"]'));

        // "Looking for" section — this is the key one
        // Tinder shows it as text near a "Looking for" header
        const lookingFor = [];
        const allTextNodes = document.body.innerText;

        // Find "Looking for" section and grab the value after it
        const lookingMatch = allTextNodes.match(/Looking for\n(.+?)(?:\n|$)/i);
        if (lookingMatch) {
          lookingFor.push(lookingMatch[1].trim());
        }

        // Also check for relationship intent icons/labels
        const intentEls = document.querySelectorAll('[class*="relationship"], [class*="intent"]');
        intentEls.forEach((el) => {
          const t = el.textContent?.trim();
          if (t && !lookingFor.includes(t)) lookingFor.push(t);
        });

        // Grab all visible text that might contain "short-term" / "long-term"
        const bodyText = document.body.innerText.toLowerCase();
        const patterns = [
          'short-term fun',
          'short-term, open to long',
          'long-term, open to short',
          'long-term partner',
          'still figuring it out',
          'new friends',
          'just here for friends',
        ];
        patterns.forEach((p) => {
          if (bodyText.includes(p) && !lookingFor.some((l) => l.toLowerCase().includes(p))) {
            lookingFor.push(p);
          }
        });

        return { name, age, bio, distance, interests: [...new Set(interests)], lookingFor: [...new Set(lookingFor)] };
      });

      return profile;
    } catch {
      return { name: null, age: null, bio: null, distance: null, interests: [], lookingFor: [] };
    }
  }

  async #screenshotProfile(id) {
    const screenshotPath = path.join(SCREENSHOTS_DIR, `profile_${id}.png`);
    try {
      // Screenshot just the profile card area
      const card = await this.page.$('[data-testid="swipe-card"], .gamepad, [class*="recsCardboard"]');
      if (card) {
        await card.screenshot({ path: screenshotPath });
      } else {
        await this.page.screenshot({ path: screenshotPath, fullPage: false });
      }
    } catch {
      await this.page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    }
    return screenshotPath;
  }

  // ──────────────────────────────────────
  // SWIPE DETECTION (training mode)
  // ──────────────────────────────────────

  async #waitForSwipe(timeoutMs = 60000) {
    return Promise.race([
      this.page.evaluate(() =>
        new Promise((res) => {
          const h = (e) => {
            if (e.key === 'ArrowRight') { document.removeEventListener('keydown', h); res('like'); }
            if (e.key === 'ArrowLeft') { document.removeEventListener('keydown', h); res('pass'); }
          };
          document.addEventListener('keydown', h);
        })
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Swipe timed out — no key press detected')), timeoutMs)
      ),
    ]);
  }

  // ──────────────────────────────────────
  // PERSISTENCE
  // ──────────────────────────────────────

  async #loadPreferences() {
    try {
      const data = await fs.readFile(PREFS_FILE, 'utf-8');
      this.preferences = JSON.parse(data);
      log.info(`Loaded ${this.preferences.totalTrained} training swipes from history`);
    } catch {
      log.info('No previous training data — starting fresh');
    }
  }

  async #savePreferences() {
    await fs.mkdir(path.dirname(PREFS_FILE), { recursive: true });
    await fs.writeFile(PREFS_FILE, JSON.stringify(this.preferences, null, 2));
    log.success(`Saved preferences (${this.preferences.totalTrained} total swipes)`);
  }

  async close() {
    await this.#savePreferences();
  }
}

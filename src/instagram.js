import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { log, sleep, humanDelay, readingDelay } from './utils.js';

const PROCESSED_LOG = 'data/instagram_processed.json';
// Never exceed this per run — Instagram flags burst activity hard
const MAX_CONVERSATIONS_PER_RUN = 3;

export class InstagramMessenger {
  constructor(page, browserContext) {
    this.page = page;
    this.context = browserContext;
    this.claudePage = null;
    this.messagesSent = 0;
    // thread IDs already replied to this session or in previous runs
    this.processedThreads = new Set();
  }

  async init() {
    await this.#loadProcessedLog();

    log.dino('Opening Claude AI tab for Instagram...');
    this.claudePage = await this.context.newPage();

    try {
      await this.claudePage.goto('https://claude.ai', { waitUntil: 'networkidle', timeout: 60000 });
    } catch {
      log.info('Claude.ai slow to load, retrying...');
      try {
        await this.claudePage.goto('https://claude.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await humanDelay(5000, 8000);
      } catch {
        log.error('Could not load claude.ai');
        return false;
      }
    }
    await humanDelay(2000, 4000);

    const chatInput = await this.claudePage.$('[contenteditable="true"], textarea[placeholder]');
    if (!chatInput) {
      log.info('Please log into claude.ai in the browser window that just opened.');
      log.info('Waiting up to 2 minutes...');
      try {
        await this.claudePage.waitForSelector('[contenteditable="true"], textarea[placeholder]', {
          timeout: 120000,
        });
        log.success('Claude AI ready!');
      } catch {
        log.error('Could not detect Claude login. Instagram messaging will be skipped.');
        return false;
      }
    } else {
      log.success('Claude AI already logged in!');
    }

    return true;
  }

  async processInbox() {
    log.dino('Opening Instagram DMs... 📸');

    const ready = await this.init();
    if (!ready) return;

    await this.page.bringToFront();
    await humanDelay(1000, 2000);

    // Go to Instagram home first — it will redirect to login if not authenticated
    await this.#igGoto('https://www.instagram.com/');
    await humanDelay(3000, 5000);

    // Detect login state: if URL contains /accounts/login or username input is present
    const currentUrl = this.page.url();
    const isLoginPage = currentUrl.includes('/accounts/login') ||
      !!(await this.page.$('input[name="username"]').catch(() => null));

    if (isLoginPage) {
      log.info('Please log in to Instagram in the browser window.');
      log.info('Waiting up to 3 minutes for you to log in...');
      try {
        // Wait for the URL to change away from the login page
        await this.page.waitForFunction(
          () => !window.location.href.includes('/accounts/login'),
          { timeout: 180000 }
        );
        log.success('Instagram login detected!');
        await humanDelay(4000, 7000);
      } catch {
        log.error('Instagram login timed out. Skipping.');
        return;
      }
    } else {
      log.success('Already logged in to Instagram!');
    }

    // Navigate to DM inbox
    log.info('Navigating to DM inbox...');
    await this.#igGoto('https://www.instagram.com/direct/inbox/');
    await humanDelay(4000, 7000);

    const threads = await this.#getThreads();
    log.info(`Found ${threads.length} Instagram threads to evaluate`);

    let processed = 0;
    for (const thread of threads) {
      if (processed >= MAX_CONVERSATIONS_PER_RUN) {
        log.info(`Reached ${MAX_CONVERSATIONS_PER_RUN} conversation limit for this run. Stopping.`);
        break;
      }
      try {
        const replied = await this.#processThread(thread);
        if (replied) {
          processed++;
          // Much longer delay between conversations than Tinder — Instagram is stricter
          const delayMs = 120000 + Math.random() * 180000; // 2–5 min
          log.info(`Waiting ${Math.round(delayMs / 1000)}s before next conversation...`);
          await sleep(delayMs);
        }
      } catch (err) {
        log.error(`Error processing Instagram thread: ${err.message}`);
        await humanDelay(10000, 20000);
      }
    }

    await this.claudePage?.close().catch(() => {});
    log.dino(`Instagram done! Sent ${this.messagesSent} messages 📸`);
  }

  async #getThreads() {
    await this.page.bringToFront();

    // Wait for the inbox conversation list to render
    log.info('Waiting for DM inbox to load...');
    try {
      await this.page.waitForSelector(
        'a[href*="/direct/t/"], div[role="listbox"], div[role="list"]',
        { timeout: 15000 }
      );
    } catch {
      log.warn('Inbox list did not appear within 15s — will try anyway');
    }
    await humanDelay(2000, 3000);

    const threadData = await this.page.evaluate(() => {
      // Strategy 1: direct thread links
      let anchors = Array.from(document.querySelectorAll('a[href*="/direct/t/"]'));

      // Strategy 2: any <a> inside the inbox area whose href contains a numeric thread id
      if (anchors.length === 0) {
        anchors = Array.from(document.querySelectorAll('a[href]')).filter((a) =>
          /\/direct\/t\/\d+/.test(a.getAttribute('href') || '')
        );
      }

      // Strategy 3: look for list items that behave like conversation rows
      if (anchors.length === 0) {
        const rows = Array.from(document.querySelectorAll('[role="listitem"], [role="option"]'));
        for (const row of rows) {
          const a = row.querySelector('a[href]');
          if (a && /direct/.test(a.getAttribute('href') || '')) anchors.push(a);
        }
      }

      return anchors.map((a) => {
        const href = a.getAttribute('href');
        const threadId = href?.match(/\/direct\/t\/([^/]+)/)?.[1] || href;
        const nameEl = a.querySelector('[title], img[alt], span');
        const name = nameEl?.getAttribute('title') || nameEl?.getAttribute('alt') || nameEl?.textContent?.trim() || 'them';
        return { href, threadId, name: name.trim() };
      }).filter((t) => t.threadId);
    });

    log.info(`Raw thread anchors found: ${threadData.length}`);

    // Debug: if nothing found, dump all hrefs on page so we can fix selectors
    if (threadData.length === 0) {
      const debugInfo = await this.page.evaluate(() => {
        const url = window.location.href;
        const allLinks = Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .filter((h) => h && h.length > 1)
          .slice(0, 30);
        const roles = Array.from(document.querySelectorAll('[role]'))
          .map((el) => `${el.tagName}[role="${el.getAttribute('role')}"]`)
          .slice(0, 20);
        return { url, allLinks, roles };
      });
      log.warn(`Current URL: ${debugInfo.url}`);
      log.warn(`All links on page: ${debugInfo.allLinks.join(' | ')}`);
      log.warn(`Role elements: ${debugInfo.roles.join(' | ')}`);
    }

    // Deduplicate by threadId and skip already-processed threads
    const unique = [];
    const seen = new Set();
    for (const t of threadData) {
      if (seen.has(t.threadId) || this.processedThreads.has(t.threadId)) continue;
      seen.add(t.threadId);
      unique.push(t);
      if (unique.length >= MAX_CONVERSATIONS_PER_RUN * 2) break; // fetch a buffer
    }
    return unique;
  }

  async #processThread(thread) {
    await this.page.bringToFront();
    await humanDelay(800, 2000);

    // Navigate to the thread URL directly (more reliable than clicking small list items)
    try {
      await this.page.goto(`https://www.instagram.com${thread.href}`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
    } catch {
      await humanDelay(3000, 5000);
    }
    await humanDelay(2000, 4000);

    const messages = await this.#getMessages();
    const partnerName = thread.name !== 'them' ? thread.name : await this.#getPartnerName();

    log.info(`Instagram chat with ${partnerName}: ${messages.length} messages`);

    // Only reply if their message is the last one (don't double-text)
    if (messages.length === 0) {
      log.info(`No messages found in thread with ${partnerName}, skipping`);
      return false;
    }
    if (messages[messages.length - 1].isMe) {
      log.info(`Last message was mine in thread with ${partnerName}, waiting for reply`);
      this.processedThreads.add(thread.threadId);
      return false;
    }

    // Simulate reading the conversation naturally
    const lastMsg = messages[messages.length - 1].text;
    log.info(`Last message from ${partnerName}: "${lastMsg.substring(0, 80)}"`);
    await readingDelay(lastMsg);

    const response = await this.#generateResponse(partnerName, messages);
    if (!response) return false;

    // Back to Instagram, simulate thinking
    await this.page.bringToFront();
    await humanDelay(5000, 12000); // Longer "thinking" pause than Tinder

    const sent = await this.#sendMessage(response);
    if (sent) {
      this.messagesSent++;
      this.processedThreads.add(thread.threadId);
      await this.#saveProcessedLog();
      log.like(`Sent Instagram message to ${partnerName}: "${response.substring(0, 50)}..."`);
      return true;
    }
    return false;
  }

  async #getMessages() {
    return await this.page.evaluate(() => {
      const messages = [];

      // Instagram messages live in a scrollable div with role="listbox" or similar.
      // Each message row is a div/li containing either "You" (sent) or a username bubble.
      // Strategy: find message rows by the aria-label or data attributes on the wrapper.

      // Primary: rows in the conversation — Instagram uses role="row" or role="listitem"
      let rows = Array.from(document.querySelectorAll('[role="row"], [role="listitem"]'));

      // Filter to only rows that look like message bubbles (have non-trivial text)
      rows = rows.filter((r) => {
        const text = r.textContent?.trim();
        return text && text.length > 0 && text.length < 2000;
      });

      if (rows.length === 0) {
        // Fallback: look for the main content area and find text containers
        const main = document.querySelector('main, [role="main"]');
        if (main) {
          rows = Array.from(main.querySelectorAll('div, span')).filter((el) => {
            const text = el.textContent?.trim();
            const rect = el.getBoundingClientRect();
            return text && text.length > 1 && text.length < 500 && rect.width > 50 && rect.width < 500;
          });
        }
      }

      const seen = new Set();
      for (const row of rows) {
        const text = row.textContent?.trim();
        if (!text || text.length < 1 || seen.has(text)) continue;

        // Skip timestamps, reactions, system notices
        if (/^\d{1,2}:\d{2}/.test(text)) continue;
        if (/^(seen|delivered|active|liked a message)/i.test(text)) continue;
        if (text.length > 1000) continue;

        seen.add(text);

        // Determine if it's our message:
        // Instagram right-aligns our messages. Check computed style or look for
        // an aria-label containing "You" on the row or its parent.
        const ariaLabel = row.getAttribute('aria-label') || '';
        const parentAria = row.parentElement?.getAttribute('aria-label') || '';
        const combined = (ariaLabel + parentAria).toLowerCase();

        // Also check horizontal position — our messages are typically right of center
        const rect = row.getBoundingClientRect();
        const viewMidpoint = window.innerWidth / 2;
        const isRightAligned = rect.left > viewMidpoint - 50;

        const isMe = combined.includes('you') || combined.includes('your message') || isRightAligned;

        messages.push({ text, isMe });
      }

      // Deduplicate consecutive identical sender entries (list can have duplicates)
      const deduped = [];
      for (const m of messages) {
        const last = deduped[deduped.length - 1];
        if (!last || last.text !== m.text) deduped.push(m);
      }
      return deduped;
    });
  }

  async #getPartnerName() {
    const name = await this.page.evaluate(() => {
      // The conversation partner's name appears in the header of the DM thread
      const header = document.querySelector('header h2, header span[dir="auto"], [role="heading"]');
      if (header) {
        const text = header.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) return text;
      }
      // Fallback: look for any prominent username in the top area of the page
      const links = Array.from(document.querySelectorAll('a[href*="/"]')).filter((a) => {
        const rect = a.getBoundingClientRect();
        return rect.top < 200 && rect.left > 50 && a.textContent?.trim().length > 0;
      });
      if (links.length > 0) return links[0].textContent?.trim();
      return null;
    });
    return name || 'her';
  }

  async #generateResponse(partnerName, history) {
    const historyText =
      history.length > 0
        ? history.map((m) => `${m.isMe ? 'Me' : partnerName}: ${m.text}`).join('\n')
        : 'No messages yet';

    const prompt = `You are ${config.ai.yourName}, a ${config.ai.yourAge}yo guy based in ${config.ai.yourCity} chatting on Instagram DMs.
Your Instagram name is ${config.ai.yourName}.
You're chill, confident, a bit cheeky, and you mix Czech/Slovak/English naturally.
You're NOT looking for anything serious — you want to meet up, have fun, flirt.

Bio: ${config.ai.yourBio || 'Fun guy looking for fun'}

Her Instagram name: ${partnerName}
Conversation so far:
${historyText}

Write a reply.

RULES:
- Keep it SHORT (1-2 sentences, max 15 words ideally)
- If she writes in English, reply in English. Otherwise always write in SLOVAK.
- Be flirty, teasing, confident — like a guy who has options but is genuinely interested
- Push the conversation toward MEETING UP (drinks, coffee, walk, hangout). Don't stay in texting limbo.
- If she's being dry or not engaging, tease her about it playfully
- NEVER be desperate, clingy, or overly complimentary
- NEVER explicitly mention sex or anything sexual — keep it suggestive through vibe only
- NO cheesy pickup lines, NO cringe
- Sound like a real ${config.ai.yourAge}yo texting on Instagram, not a bot. Use casual grammar, occasional emojis (max 1-2)
- If she asked a question, answer it briefly then redirect toward meeting
- Only output the raw message text, absolutely nothing else — no quotes, no labels, no explanation`;

    try {
      return await this.#askClaude(prompt);
    } catch (err) {
      log.error(`AI error: ${err.message}`);
      return null;
    }
  }

  async #askClaude(prompt) {
    await this.claudePage.bringToFront();

    try {
      await this.claudePage.goto('https://claude.ai/new', { waitUntil: 'networkidle', timeout: 60000 });
    } catch {
      await this.claudePage.goto('https://claude.ai/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await humanDelay(5000, 8000);
    }
    await humanDelay(2000, 4000);

    const inputSet = await this.claudePage.evaluate((text) => {
      const ce = document.querySelector('[contenteditable="true"]');
      if (ce) {
        ce.focus();
        ce.textContent = text;
        ce.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      const ta = document.querySelector('textarea');
      if (ta) {
        ta.focus();
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }, prompt);

    if (!inputSet) {
      log.error('Could not find Claude input field');
      return null;
    }

    await humanDelay(300, 800);

    const sendBtn = await this.claudePage.$('button[aria-label="Send"], button[type="submit"]');
    if (sendBtn) await sendBtn.click({ force: true }).catch(() => {});
    await humanDelay(200, 500);
    await this.claudePage.keyboard.press('Enter');
    await humanDelay(3000, 5000);

    try {
      await this.claudePage.waitForFunction(() => {
        const msgs = document.querySelectorAll('[data-testid="assistant-message"], .prose, [data-message-author="assistant"]');
        return msgs.length > 0;
      }, { timeout: 15000 }).catch(() => {});

      await humanDelay(2000, 4000);
      await this.claudePage.waitForFunction(() => {
        const stopBtn = document.querySelector('button[aria-label="Stop"]');
        return !stopBtn || stopBtn.offsetParent === null;
      }, { timeout: 30000 }).catch(() => {});
    } catch {
      await sleep(10000);
    }
    await humanDelay(1000, 2000);

    const responseText = await this.claudePage.evaluate(() => {
      const selectors = [
        '[data-testid="assistant-message"]',
        '[data-message-author="assistant"]',
        '.prose',
        '.markdown',
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) return els[els.length - 1].textContent?.trim();
      }
      return null;
    });

    return responseText;
  }

  async #sendMessage(text) {
    // Instagram DM input is a contenteditable div with role="textbox"
    const inputSelector = await this.page.evaluate(() => {
      const selectors = [
        'div[role="textbox"][aria-label*="essage" i]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'textarea[placeholder*="essage" i]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.focus(); return sel; }
      }
      return null;
    });

    if (!inputSelector) {
      log.error('Could not find Instagram message input');
      return false;
    }

    await this.page.click(inputSelector);
    await humanDelay(500, 1200);

    // Type word-by-word with Instagram-appropriate per-character delay
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const chunk = i < words.length - 1 ? words[i] + ' ' : words[i];
      await this.page.keyboard.type(chunk, { delay: 60 }); // slightly slower than Tinder
      await humanDelay(100, 350);
    }

    await humanDelay(800, 2500); // Pause before sending
    await this.page.keyboard.press('Enter');
    await humanDelay(2000, 4000);
    return true;
  }

  async #loadProcessedLog() {
    try {
      const raw = await fs.readFile(PROCESSED_LOG, 'utf8');
      const data = JSON.parse(raw);
      // Only keep threads processed in the last 24 hours to avoid permanent skip
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const [id, ts] of Object.entries(data)) {
        if (ts > cutoff) this.processedThreads.add(id);
      }
    } catch {
      // File doesn't exist yet — fine
    }
  }

  async #igGoto(url) {
    try {
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    } catch {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
  }

  async #saveProcessedLog() {
    try {
      await fs.mkdir('data', { recursive: true });
      // Build a map of threadId -> timestamp
      let existing = {};
      try {
        existing = JSON.parse(await fs.readFile(PROCESSED_LOG, 'utf8'));
      } catch { /* empty */ }

      for (const id of this.processedThreads) {
        if (!existing[id]) existing[id] = Date.now();
      }
      await fs.writeFile(PROCESSED_LOG, JSON.stringify(existing, null, 2));
    } catch (err) {
      log.warn(`Could not save Instagram processed log: ${err.message}`);
    }
  }
}

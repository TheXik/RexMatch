import { config } from './config.js';
import { log, sleep, humanDelay, readingDelay } from './utils.js';

export class Messenger {
  constructor(page, browserContext) {
    this.page = page;
    this.context = browserContext;
    this.claudePage = null;
    this.messagesSent = 0;
    this.processedUrls = new Set(); // deduplicate across the session
  }

  async init() {
    log.dino('Opening Claude AI tab...');
    this.claudePage = await this.context.newPage();

    // Claude.ai can be slow — try with longer timeout, fallback to domcontentloaded
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
        log.error('Could not detect Claude login. Messaging will be skipped.');
        return false;
      }
    } else {
      log.success('Claude AI already logged in!');
    }

    return true;
  }

  async processMatches() {
    log.dino('Rex checking matches... 🦕💬');

    const ready = await this.init();
    if (!ready) return;

    // Switch back to Tinder tab
    await this.page.bringToFront();
    await humanDelay(1000, 2000);

    // Click "Messages" tab if visible
    const msgsTab = await this.page.$('a[href*="matches"], a[href*="messages"], button:has-text("Messages"), [aria-label*="Messages"]').catch(() => null);
    if (msgsTab) {
      await msgsTab.click();
      await humanDelay(2000, 4000);
    }

    // Wait for conversations to load
    await humanDelay(3000, 5000);

    const matches = await this.#getMatches();
    log.info(`Found ${matches.length} conversations to process`);

    for (const match of matches) {
      try {
        await this.#processConversation(match);
        // Human-like delay between conversations (30s - 2min)
        await humanDelay(30000, 120000);
      } catch (err) {
        log.error(`Error processing match: ${err.message}`);
        await humanDelay(5000, 10000);
      }
    }

    await this.claudePage?.close().catch(() => {});
    log.dino(`Messaging done! Sent ${this.messagesSent} messages 🦕`);
  }

  async #getMatches() {
    // Tinder's match list uses various selectors — try multiple approaches
    const conversations = await this.page.evaluate(() => {
      const results = [];

      // Try: clickable match/conversation items in the sidebar
      const selectors = [
        '[data-testid="match-list-item"]',
        'a[href*="/app/messages/"]',
        '[class*="matchListItem"]',
        '[class*="messageListItem"]',
      ];

      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          return { selector: sel, count: els.length };
        }
      }

      // Fallback: look for the conversation list container and its children
      const listItems = document.querySelectorAll('li a[href*="messages"]');
      if (listItems.length > 0) {
        return { selector: 'li a[href*="messages"]', count: listItems.length };
      }

      return null;
    });

    if (!conversations) {
      log.info('Could not find conversation list. Trying link-based approach...');

      const links = await this.page.$$('a[href*="/app/messages/"]');
      if (links.length > 0) {
        log.info(`Found ${links.length} conversations via links`);
        return this.#deduplicateMatchEls(links);
      }

      return [];
    }

    log.info(`Found conversations using selector: ${conversations.selector}`);
    const matchEls = await this.page.$$(conversations.selector);
    return this.#deduplicateMatchEls(matchEls);
  }

  async #deduplicateMatchEls(els) {
    const unique = [];
    for (const el of els) {
      const href = await el.getAttribute('href').catch(() => null)
        ?? await el.$eval('a[href*="messages"]', (a) => a.getAttribute('href')).catch(() => null);
      if (!href || this.processedUrls.has(href)) continue;
      this.processedUrls.add(href);
      unique.push(el);
      if (unique.length >= 5) break;
    }
    return unique;
  }

  async #processConversation(matchEl) {
    await this.page.bringToFront();
    await humanDelay(500, 1500);
    await matchEl.click();
    await humanDelay(2000, 4000); // Wait for conversation to load

    const messages = await this.#getConversationHistory();
    const matchName = await this.#getMatchName();

    log.info(`Chat with ${matchName}: found ${messages.length} messages`);
    if (messages.length > 0) {
      for (const m of messages) {
        log.info(`  ${m.isMe ? '→ Me' : '← Them'}: "${m.text.substring(0, 80)}"`);
      }
    }

    // Skip if the last message is already from me — wait for her reply first
    if (messages.length > 0 && messages[messages.length - 1].isMe) {
      log.info(`Last message was mine, waiting for ${matchName} to reply...`);
      return;
    }

    // Simulate reading the conversation
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1].text;
      await readingDelay(lastMsg);
    }

    const response = await this.#generateResponse(matchName, messages);
    if (!response) return;

    // Switch back to Tinder and simulate "thinking" before typing
    await this.page.bringToFront();
    await humanDelay(3000, 8000); // Think about what to say

    const sent = await this.#sendMessage(response);
    if (sent) {
      this.messagesSent++;
      log.like(`Sent message to ${matchName}: "${response.substring(0, 50)}..."`);
    }
  }

  async #getConversationHistory() {
    return await this.page.evaluate(() => {
      const messages = [];

      // Tinder chat messages live in the center/right chat panel.
      // The key is to find the chat container — NOT the sidebar.
      // Chat messages are inside elements with role="log" or the main chat area.

      // Strategy 1: Find the chat log container (aria role)
      let chatContainer = document.querySelector('[role="log"]');

      // Strategy 2: Find the chat thread area by looking for the message input
      // and walking up to its sibling/parent that contains messages
      if (!chatContainer) {
        const input = document.querySelector('textarea[placeholder*="message" i], textarea[placeholder*="type" i], [data-testid="chat-input"]');
        if (input) {
          // Walk up to find the scrollable chat container
          let parent = input.parentElement;
          for (let i = 0; i < 10 && parent; i++) {
            const scrollable = parent.scrollHeight > parent.clientHeight;
            const hasMultipleChildren = parent.children.length > 3;
            if (scrollable && hasMultipleChildren) {
              chatContainer = parent;
              break;
            }
            parent = parent.parentElement;
          }
        }
      }

      // Strategy 3: Look for the chat area by common Tinder class patterns
      if (!chatContainer) {
        const candidates = document.querySelectorAll('[class*="chat" i], [class*="conversation" i], [class*="thread" i]');
        for (const c of candidates) {
          // The chat container should be in the center/right, not the sidebar
          const rect = c.getBoundingClientRect();
          if (rect.left > 200 && rect.width > 300 && c.children.length > 2) {
            chatContainer = c;
            break;
          }
        }
      }

      if (!chatContainer) {
        // Last resort: grab everything but that's what was failing, so return empty
        return [];
      }

      // Extract message bubbles from the chat container.
      // Tinder formats messages as "You:message" (sent) or "Name:message" (received).
      // We grab the TOP-LEVEL message containers that have these prefixes,
      // then strip the prefix and use it for sender detection.
      const allElements = chatContainer.querySelectorAll('span, p, div');
      const seen = new Set();

      for (const el of allElements) {
        const rawText = el.textContent?.trim();
        if (!rawText || rawText.length < 2 || rawText.length > 500) continue;

        // Skip timestamps, system messages, UI labels
        if (/^\d{1,2}:\d{2}/.test(rawText)) continue;
        if (/^(sent|delivered|read|typing|today|yesterday)/i.test(rawText)) continue;
        if (/^you matched/i.test(rawText)) continue;
        if (/^(gif|photo|image)$/i.test(rawText)) continue;

        // Detect sender using text prefix pattern: "You:msg" or "Name:msg"
        const youMatch = rawText.match(/^You:(.+)$/s);
        const nameMatch = rawText.match(/^([A-Za-zÀ-žěščřžýáíéůúďťň]+):(.+)$/s);

        let text;
        let isMe;

        if (youMatch) {
          text = youMatch[1].trim();
          isMe = true;
        } else if (nameMatch && nameMatch[1].length < 20) {
          text = nameMatch[2].trim();
          isMe = false;
        } else {
          // No prefix — this is likely a child element of a prefixed parent,
          // or a standalone element (emoji-only, etc.)
          // Skip it to avoid duplicates with the prefixed version
          continue;
        }

        if (!text || text.length < 1) continue;
        if (seen.has(text)) continue;
        seen.add(text);

        messages.push({ text, isMe });
      }

      return messages;
    });
  }

  async #getMatchName() {
    const name = await this.page.evaluate(() => {
      // The match name appears in the chat header area (center/right panel).
      // We need to avoid grabbing names from the sidebar match list.

      // Strategy 1: Look for a header that's in the chat area (not sidebar)
      const headers = document.querySelectorAll('h1, h2, h3, [class*="name" i]');
      for (const h of headers) {
        const rect = h.getBoundingClientRect();
        // Chat header should be in center/right part of screen (past sidebar)
        if (rect.left > 200 && rect.width < 400) {
          const text = h.textContent?.trim();
          if (text && text.length > 0 && text.length < 30) {
            // Remove age if present (e.g., "Ali 20" -> "Ali")
            return text.replace(/\s*\d{1,2}\s*$/, '').trim();
          }
        }
      }

      // Strategy 2: Look for the name near the chat input area
      const input = document.querySelector('textarea[placeholder*="message" i], textarea[placeholder*="type" i]');
      if (input) {
        // Walk up and look for a nearby header
        let parent = input.parentElement;
        for (let i = 0; i < 15 && parent; i++) {
          const h = parent.querySelector('h1, h2, h3');
          if (h) {
            const text = h.textContent?.trim();
            if (text && text.length > 0 && text.length < 30) {
              return text.replace(/\s*\d{1,2}\s*$/, '').trim();
            }
          }
          parent = parent.parentElement;
        }
      }

      return null;
    });
    return name || 'her';
  }

  async #generateResponse(matchName, history) {
    const historyText =
      history.length > 0
        ? history.map((m) => `${m.isMe ? 'Me' : matchName}: ${m.text}`).join('\n')
        : 'No messages yet - this is the opening message';

    const isOpener = history.length === 0;
    const isSentLastMsg = history.length > 0 && history[history.length - 1].isMe;

    const taskLine = isOpener
      ? 'Write an opening message.'
      : isSentLastMsg
      ? "You sent the last message and she hasn't replied. Send a playful follow-up to re-engage her."
      : 'Write a reply.';

    const prompt = `You are ${config.ai.yourName}, a ${config.ai.yourAge}yo guy based in ${config.ai.yourCity} chatting on Tinder.
Your Tinder name is ${config.ai.yourTinderName}.
You're chill, confident, a bit cheeky, and you mix Czech/Slovak/English naturally.
You're NOT looking for anything serious — you want to meet up, have fun, flirt.

Bio: ${config.ai.yourBio || 'Fun guy looking for fun'}

Match name: ${matchName}
Conversation so far:
${historyText}

${taskLine}

RULES:
- Keep it SHORT (1-2 sentences, max 15 words ideally)
- If she writes in English, reply in English. Otherwise always write in SLOVAK.
- Be flirty, teasing, confident — like a guy who has options but is genuinely interested
- Push the conversation toward MEETING UP (drinks, coffee, walk, hangout). Don't stay in texting limbo.
- If she's being dry or not engaging, tease her about it playfully
- NEVER be desperate, clingy, or overly complimentary
- NEVER explicitly mention sex or anything sexual — keep it suggestive through vibe only
- NO cheesy pickup lines, NO cringe
- Sound like a real ${config.ai.yourAge}yo texting, not a bot. Use casual grammar, occasional emojis (max 1-2)
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

    // Use JS to set input (avoids click interception)
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

    // Send
    const sendBtn = await this.claudePage.$('button[aria-label="Send"], button[type="submit"]');
    if (sendBtn) await sendBtn.click({ force: true }).catch(() => {});
    await humanDelay(200, 500);
    await this.claudePage.keyboard.press('Enter');
    await humanDelay(3000, 5000);

    // Wait for response
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

    // Extract response
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
    // Find the message input
    const input = await this.page.evaluate(() => {
      const selectors = [
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="Type"]',
        'input[placeholder*="message"]',
        '[data-testid="chat-input"]',
        'textarea',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.focus(); return sel; }
      }
      return null;
    });

    if (!input) {
      log.error('Could not find message input');
      return false;
    }

    await this.page.click(input);
    await humanDelay(300, 800);

    // Type word-by-word (more natural than per-character and far fewer awaits)
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const chunk = i < words.length - 1 ? words[i] + ' ' : words[i];
      await this.page.keyboard.type(chunk, { delay: 40 });
      await humanDelay(80, 250); // inter-word pause
    }

    await humanDelay(500, 2000); // Pause before sending (reviewing message)
    await this.page.keyboard.press('Enter');
    await humanDelay(1000, 3000);
    return true;
  }
}

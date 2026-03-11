import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { log, sleep, randomDelay } from './utils.js';

export class Messenger {
  constructor(page) {
    this.page = page;
    this.client = new Anthropic({ apiKey: config.ai.apiKey });
    this.messagesSent = 0;
  }

  async processMatches() {
    log.dino('Rex checking matches... 🦕💬');

    await this.page.goto('https://tinder.com/app/messages');
    await sleep(3000);

    const matches = await this.#getMatches();
    log.info(`Found ${matches.length} conversations to process`);

    for (const match of matches) {
      try {
        await this.#processConversation(match);
        await randomDelay(2000, 5000);
      } catch (err) {
        log.error(`Error processing match: ${err.message}`);
      }
    }

    log.dino(`Messaging done! Sent ${this.messagesSent} messages 🦕`);
  }

  async #getMatches() {
    // Get match list items
    const matchEls = await this.page.$$('[data-testid="match-list-item"]');
    return matchEls.slice(0, 10); // Process up to 10 at a time
  }

  async #processConversation(matchEl) {
    await matchEl.click();
    await sleep(1500);

    // Get conversation history
    const messages = await this.#getConversationHistory();
    const matchName = await this.#getMatchName();

    // Don't message if we already sent the last message
    if (messages.length > 0 && messages[messages.length - 1].isMe) {
      log.info(`Waiting for ${matchName} to reply...`);
      return;
    }

    // Generate AI response
    const response = await this.#generateResponse(matchName, messages);
    if (!response) return;

    // Type and send
    await this.#sendMessage(response);
    this.messagesSent++;
    log.like(`Sent message to ${matchName}: "${response.substring(0, 50)}..."`);
  }

  async #getConversationHistory() {
    const messages = [];
    const msgEls = await this.page.$$('[class*="message"]');

    for (const el of msgEls) {
      const text = await el.textContent().catch(() => '');
      const isSent = await el.evaluate(
        (e) => e.className.includes('sent') || e.className.includes('mine')
      );
      if (text?.trim()) {
        messages.push({ text: text.trim(), isMe: isSent });
      }
    }

    return messages;
  }

  async #getMatchName() {
    const nameEl = await this.page.$('h1, [data-testid="match-name"]');
    return nameEl ? (await nameEl.textContent())?.trim() || 'her' : 'her';
  }

  async #generateResponse(matchName, history) {
    const historyText =
      history.length > 0
        ? history.map((m) => `${m.isMe ? 'Me' : matchName}: ${m.text}`).join('\n')
        : 'No messages yet - this is the opening message';

    const prompt = `You are helping ${config.ai.yourName} chat on Tinder.
Bio: ${config.ai.yourBio || 'A fun, genuine person looking for connection'}
Style: ${config.ai.openerStyle}

Match name: ${matchName}
Conversation so far:
${historyText}

Write a single ${history.length === 0 ? 'opening' : 'reply'} message.
Rules:
- Keep it SHORT (1-2 sentences max)
- Be genuine, witty, and engaging
- NO cheesy pickup lines
- Sound like a real human, not a bot
- If opening, reference their name or ask something interesting
- Only output the message text, nothing else`;

    try {
      const response = await this.client.messages.create({
        model: config.ai.model,
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });

      return response.content[0].text.trim();
    } catch (err) {
      log.error(`AI error: ${err.message}`);
      return null;
    }
  }

  async #sendMessage(text) {
    const input = await this.page.$('[data-testid="chat-input"], textarea[placeholder*="message"]');
    if (!input) {
      log.error('Could not find message input');
      return;
    }

    await input.click();
    await this.page.keyboard.type(text, { delay: randomTypingDelay() });
    await sleep(500);
    await this.page.keyboard.press('Enter');
    await sleep(1000);
  }
}

function randomTypingDelay() {
  return Math.floor(Math.random() * 80) + 40; // 40-120ms per keystroke
}

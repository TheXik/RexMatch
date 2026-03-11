# 🦕 RexMatch — Infrastructure & Architecture

## Overview

RexMatch is a **local-first** Node.js automation bot. It runs entirely on your machine — no servers, no cloud, no database. The only external services are Tinder (via browser) and the Anthropic Claude API (for messaging).

```
┌─────────────────────────────────────────────────────────┐
│                     Your Machine                        │
│                                                         │
│   ┌─────────────┐    ┌──────────────┐                  │
│   │  RexMatch   │───▶│  Chromium    │──▶  tinder.com   │
│   │  (Node.js)  │    │ (Playwright) │                  │
│   └──────┬──────┘    └──────────────┘                  │
│          │                                              │
│          │ HTTPS API call                               │
│          ▼                                              │
│   Anthropic Claude API (claude-opus-4-6)                │
│                                                         │
│   Local storage:                                        │
│   sessions/browser/  ← persistent Chromium profile     │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
TinderBot/
├── src/
│   ├── index.js        ← CLI entry, mode routing (swipe/chat/full)
│   ├── bot.js          ← RexMatchBot class: browser init, login, session
│   ├── swiper.js       ← Swiper class: auto-swiping with human delays
│   ├── messenger.js    ← Messenger class: reads matches, generates + sends AI replies
│   ├── config.js       ← All config from .env, single source of truth
│   └── utils.js        ← sleep, randomDelay, chalk logger
├── assets/
│   └── rex.svg         ← Dinosaur logo
├── sessions/
│   └── browser/        ← Persistent Chromium profile (login state saved here)
├── .env                ← Your secrets (gitignored)
├── .env.example        ← Template for env vars
├── package.json
├── agents.md           ← Agent delegation guide
└── infra.md            ← This file
```

---

## Core Components

### `RexMatchBot` (src/bot.js)
- Launches a **persistent Chromium context** (`sessions/browser/`) — login survives restarts
- Injects stealth scripts: removes `navigator.webdriver` flag
- First run: opens browser, you log in manually once
- Subsequent runs: session is restored automatically

### `Swiper` (src/swiper.js)
- Uses `ArrowRight` / `ArrowLeft` keyboard shortcuts (most reliable)
- Falls back to clicking `[aria-label="Like"]` / `[aria-label="Nope"]`
- Configurable like ratio (`LIKE_RATIO=0.7` = like 70% of profiles)
- Random delays between swipes (`SWIPE_DELAY_MIN` / `SWIPE_DELAY_MAX`)
- Auto-pauses on 5+ consecutive errors

### `Messenger` (src/messenger.js)
- Navigates to `tinder.com/app/messages`
- Reads conversation history from the DOM
- Skips conversations where you sent the last message (waits for reply)
- Sends conversation + your bio to Claude → gets a personalized message back
- Types at randomized human speed (40–120ms per character)

### `config.js`
- Single import for all configuration
- Reads from `.env` via `dotenv`
- All numeric env vars are `parseInt` / `parseFloat` parsed

---

## Data Flow

### Swiping Mode
```
index.js
  └── RexMatchBot.init()         # launch browser
  └── RexMatchBot.login()        # restore or manual login
  └── Swiper.swipe(limit)
        └── for each profile:
              ├── dismissPopups()
              ├── getProfileInfo()  # read name
              ├── random() < LIKE_RATIO ?
              │     ├── YES → keyboard ArrowRight (+ button fallback)
              │     └── NO  → keyboard ArrowLeft  (+ button fallback)
              └── randomDelay(min, max)
```

### Chat Mode
```
index.js
  └── Messenger.processMatches()
        └── navigate to /app/messages
        └── getMatches() → up to 10 match elements
        └── for each match:
              ├── click() → open conversation
              ├── getConversationHistory()  # DOM scrape
              ├── last message isMe? → skip (waiting for reply)
              └── generateResponse(name, history)
                    └── Claude API: claude-opus-4-6
                          prompt: your name + bio + conversation + style
                    └── sendMessage(text)
                          ├── find chat input
                          ├── type with human delay
                          └── press Enter
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TINDER_EMAIL` | — | Tinder login email |
| `TINDER_PASSWORD` | — | Tinder password |
| `ANTHROPIC_API_KEY` | — | Get at console.anthropic.com |
| `SWIPE_LIMIT` | `100` | Max swipes per run |
| `SWIPE_DELAY_MIN` | `1500` | Min ms between swipes |
| `SWIPE_DELAY_MAX` | `4000` | Max ms between swipes |
| `LIKE_RATIO` | `0.7` | Fraction of profiles to like (0–1) |
| `SESSION_FILE` | `sessions/tinder_session.json` | Session storage path |
| `YOUR_NAME` | `Rex` | Your name for AI prompts |
| `YOUR_BIO` | `""` | Short bio so Claude represents you authentically |
| `OPENER_STYLE` | `witty` | Tone: `witty` / `casual` / `sincere` |

---

## NPM Scripts

| Command | What it does |
|---|---|
| `npm run setup` | Install Playwright's Chromium browser |
| `npm run swipe` | Swipe-only mode |
| `npm run chat` | Message matches only |
| `npm run full` | Swipe + message (default) |
| `npm start` | Same as `npm run full` |

---

## Session Persistence

The bot uses Playwright's **persistent context** (`sessions/browser/`):
- Chromium stores cookies, localStorage, IndexedDB here
- After first manual login, Tinder session persists across restarts
- To reset: `rm -rf sessions/browser/`

> ⚠️ This folder contains auth cookies — it's in `.gitignore`. Never commit it.

---

## Stealth Measures

| Technique | Implementation |
|---|---|
| Remove webdriver flag | `addInitScript(() => { Object.defineProperty(navigator, 'webdriver', ...) })` |
| Real Chrome user agent | Custom UA string in context options |
| Disable automation flag | `--disable-blink-features=AutomationControlled` |
| Human-like delays | `randomDelay(min, max)` between every action |
| Human-like typing | Random 40–120ms per keystroke in `sendMessage` |
| Keyboard shortcuts | Uses `ArrowRight`/`ArrowLeft` like a human, not button clicks |

---

## Extending RexMatch

### Add a new mode (e.g. `--mode=boost`)
1. Add case in `src/index.js`
2. Create `src/booster.js` with a `Booster` class
3. Add `boost` script to `package.json`

### Add profile scoring (smart swiping)
- Create `src/scorer.js`
- In `Swiper.swipe()`, call `scorer.evaluate(profileInfo)` before deciding to like
- Feed profile photos + bio text to Claude Vision API

### Add multi-account support
- Pass `--profile=sessions/account2` as CLI arg
- `RexMatchBot.init()` reads profile path from args
- Run multiple instances in parallel

### Add scheduler (run at specific times)
- Use `node-cron` or a simple `setInterval` wrapper in `index.js`
- Recommended: run swipes during peak Tinder hours (7–9pm local time)

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `playwright` | ^1.40.0 | Browser automation |
| `anthropic` | ^0.32.0 | Claude AI API client |
| `dotenv` | ^16.3.1 | Env var loading |
| `chalk` | ^5.3.0 | Colored terminal output |
| `ora` | ^8.0.1 | Terminal spinner |
| `figlet` | ^1.7.0 | ASCII art banner |

---

## Known Limitations & Risks

| Risk | Mitigation |
|---|---|
| Tinder DOM changes break selectors | Regularly audit selectors; add fallbacks |
| Account ban for automation | Use low swipe limits, human-like delays |
| Tinder ToS violation | Use responsibly; educational purposes only |
| Anthropic rate limits | Add retry with exponential backoff in messenger.js |
| Session expiry | Bot prompts manual re-login on detection |

---

*🦕 Rex always finds a way.*

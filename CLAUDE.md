# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup      # Install Playwright's Chromium browser (first-time setup)
npm start          # Full mode: swipe + message (default)
npm run swipe      # Swiping only (random ratio)
npm run smart      # Swiping with ProfileAnalyzer rule-based decisions
npm run train      # Training mode: record manual swipes to learn preferences
npm run chat       # Messaging only
```

No test or lint commands are configured.

## Architecture

RexMatch is a Playwright-based Tinder bot with AI messaging via claude.ai. It uses ES Modules (`"type": "module"`), requires Node >=18.

**Entry point:** `src/index.js` — parses `--mode` CLI arg and routes to the appropriate class combination.

**Core classes:**

- **`RexMatchBot` (bot.js)** — browser lifecycle only. Launches a persistent Chromium context stored in `sessions/browser/` (preserves cookies across runs). Applies stealth measures on launch (removes `navigator.webdriver`, fakes plugins/chrome object, adds canvas fingerprint noise). All other classes receive `bot.page` and `bot.context`.

- **`Swiper` (swiper.js)** — swiping loop. Uses keyboard shortcuts (ArrowRight/ArrowLeft) rather than button clicks. Simulates profile viewing (scroll, photo navigation) before each swipe. Optionally delegates like/pass decisions to `ProfileAnalyzer`. Caps at 80 swipes and takes session breaks every 25-40 swipes to avoid rate limits.

- **Messenger (messenger.js)** — opens a second browser tab pointed at `claude.ai/new`, scrapes Tinder match conversations from the DOM, generates replies by interacting with claude.ai via browser automation (not the Anthropic API), then types responses with per-character human-speed delays. Skips conversations where the bot already sent the last message.

- **`ProfileAnalyzer` (analyzer.js)** — used in `--mode=train` (records user's manual swipes + screenshots to `data/preferences.json`) and `--mode=smart` (applies rule-based decisions based on "Looking for" tags, bio keywords, and interests). Persists training data to `data/preferences.json`.

- **`config.js`** — single source of truth; reads `.env` with safe defaults. Copy `.env.example` to `.env` to configure.

- **`utils.js`** — `humanDelay()` uses Gaussian distribution with a 5% chance of a 2-8x "distraction pause". `log` object wraps chalk for consistent colored output.

## Key Design Decisions

**Timing:** All delays use Gaussian distribution (not uniform random) to mimic human behavior clustering. Avoid switching to `Math.random()` ranges.

**DOM interaction:** Prefer keyboard shortcuts over clicking buttons where possible (more human-like, less brittle). Profile selectors have multiple fallbacks since Tinder's DOM changes frequently — maintain this pattern when adding new selectors.

**Claude messaging:** The bot interacts with claude.ai via browser automation, not the Anthropic API. The `Messenger` class opens a tab, sets input via `contenteditable`, and waits for the streaming response to complete. The system prompt is hardcoded in `messenger.js`.

**Session persistence:** `launchPersistentContext()` stores the full Chromium profile in `sessions/browser/`. Don't delete this directory unless intentionally resetting the login session.

**Training data:** `data/preferences.json` accumulates liked/passed profile data. `data/screenshots/` stores profile card images from training runs.

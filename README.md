# 🦕 RexMatch

> *Your prehistoric wingman. RAWR means I like you!*

![RexMatch Logo](assets/rex.svg)

RexMatch is an automated Tinder bot powered by **Playwright** and **Claude AI**. It swipes on profiles and crafts personalized messages on your behalf — so you can focus on the actual dates.

## Features

- 🦕 **Auto-swiping** with configurable like/pass ratios
- 💬 **AI-powered messaging** using Claude (Anthropic) — personalized openers and replies
- 🥷 **Stealth mode** — mimics human behavior with random delays and typing speeds
- 💾 **Persistent sessions** — no need to log in every time
- ⚙️ **Fully configurable** via `.env`

## Setup

### 1. Install dependencies

```bash
npm install
npm run setup   # installs Playwright browsers
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your settings:

| Variable | Description |
|---|---|
| `TINDER_EMAIL` | Your Tinder login email |
| `TINDER_PASSWORD` | Your Tinder password |
| `ANTHROPIC_API_KEY` | Get one at console.anthropic.com |
| `SWIPE_LIMIT` | Max swipes per session (default: 100) |
| `LIKE_RATIO` | Fraction of profiles to like (0.0–1.0) |
| `YOUR_NAME` | Your name (used by AI for messaging) |
| `YOUR_BIO` | Short bio so AI can represent you authentically |
| `OPENER_STYLE` | Message tone: `witty`, `casual`, `sincere` |

### 3. Run

```bash
# Swipe only
npm run swipe

# Message matches only
npm run chat

# Both (swipe + message)
npm run full
```

## How it works

1. **Login**: Opens a browser window. On first run, log into Tinder manually. Session is saved for future runs.
2. **Swiping**: Rex swipes right on profiles based on your `LIKE_RATIO`, with human-like random delays.
3. **Messaging**: For each match, Claude reads the conversation history and crafts a contextual, personalized message in your voice.

## ⚠️ Disclaimer

This tool is for educational purposes. Using bots on Tinder may violate their Terms of Service. Use responsibly and at your own risk.

## Tech Stack

- [Playwright](https://playwright.dev) — browser automation
- [Anthropic Claude](https://anthropic.com) — AI messaging
- [Node.js](https://nodejs.org) — runtime

---

*Built with 🦕 and ❤️ — Rex believes love is just a swipe away*

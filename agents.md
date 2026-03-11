# 🦕 RexMatch — Agent Roster

This document maps each development task in RexMatch to the right skill agent from your `coding-skills` library.
Use these prompts to delegate work to subagents efficiently.

---

## 🏗️ Architecture & Design

**Skill:** `software-architect.skill`

**When to use:** Adding new modules (e.g. profile analyzer, match scorer, scheduler), redesigning the bot pipeline, or integrating new external services (e.g. WhatsApp, Hinge).

**Prompt template:**
```
You are a software architect reviewing a Node.js + Playwright automation bot called RexMatch.
Project root: /Users/lukashellesch/Desktop/REPOS/TinderBot

Context:
- src/bot.js       → browser lifecycle + login
- src/swiper.js    → swiping logic (keyboard shortcuts + button fallback)
- src/messenger.js → AI messaging via Anthropic Claude
- src/config.js    → env-driven config
- src/index.js     → CLI entrypoint, --mode=swipe|chat|full

Task: [DESCRIBE WHAT YOU WANT TO ADD OR CHANGE]

Please: design the module structure, identify integration points, and list any architectural risks.
```

---

## 🧪 End-to-End Testing

**Skill:** `e2e-tester.skill`

**When to use:** Writing Playwright tests for swipe flows, login persistence, message sending, popup dismissal.

**Prompt template:**
```
You are an e2e testing expert working with Playwright on a Tinder automation bot.
Project: /Users/lukashellesch/Desktop/REPOS/TinderBot
Stack: Node.js ESM, Playwright (chromium), persistent context sessions

Write e2e tests for the following scenario:
[DESCRIBE THE SCENARIO — e.g. "bot should like a profile when LIKE_RATIO=1.0"]

Use Playwright test fixtures. Mock Tinder DOM elements as needed.
Output test file to tests/[filename].spec.js
```

---

## 🔒 Security Audit

**Skill:** `security-auditor.skill`

**When to use:** Before any release, after changing login flow, or when adding new env vars / API calls. Bot stealth and credential safety are critical.

**Prompt template:**
```
You are a security auditor reviewing a Playwright-based browser automation bot.
Project: /Users/lukashellesch/Desktop/REPOS/TinderBot

Audit the following files for security issues:
- src/bot.js (browser launch, session persistence)
- src/messenger.js (Anthropic API key usage)
- src/config.js (env var handling)
- .env.example (credential exposure)

Focus on:
1. Credential leakage (env vars, session files, logs)
2. Bot detection vectors (fingerprinting, timing, headers)
3. API key exposure
4. Unsafe file operations

Output: list of findings with severity (HIGH/MED/LOW) and recommended fixes.
```

---

## ⚡ Performance Optimization

**Skill:** `performance-optimizer.skill`

**When to use:** When swiping feels slow, memory climbs over long sessions, or you want to run multiple sessions in parallel.

**Prompt template:**
```
You are a performance optimization expert. Review this Playwright bot for bottlenecks:
Project: /Users/lukashellesch/Desktop/REPOS/TinderBot

Current behavior:
- Sequential swipes with random delay (1500–4000ms)
- Full page navigation to messages tab
- No caching of DOM selectors

Tasks:
1. Identify the top 3 performance bottlenecks
2. Suggest optimizations (selector caching, parallel context, request interception)
3. Implement changes in src/swiper.js and src/messenger.js

Keep human-like timing intact to avoid bot detection.
```

---

## 🐛 Debugging

**Skill:** `debugger.skill`

**When to use:** Swipes not registering, login failing, AI messages not sending, selectors breaking after Tinder DOM updates.

**Prompt template:**
```
You are debugging a Playwright Tinder bot.
Project: /Users/lukashellesch/Desktop/REPOS/TinderBot

Problem: [DESCRIBE THE BUG — e.g. "Like button click has no effect after popup dismissal"]

Relevant files: [LIST FILES]
Error output:
[PASTE ERROR / LOG]

Steps already tried: [LIST]

Please: identify root cause, propose fix, and update the relevant source file.
```

---

## 🔄 Refactoring

**Skill:** `refactorer.skill`

**When to use:** After adding features that bloat `bot.js` or `messenger.js`, or when selector logic gets messy.

**Prompt template:**
```
Refactor the following file in /Users/lukashellesch/Desktop/REPOS/TinderBot:
File: src/[FILENAME]

Goals:
- [e.g. extract selector constants to a selectors.js file]
- [e.g. split Messenger into MessageReader + MessageWriter]
- Keep all existing behavior intact
- ESM imports, no TypeScript

Output the refactored file(s) only.
```

---

## 🛡️ Error Handling

**Skill:** `error-handler.skill`

**When to use:** Making the bot resilient to Tinder UI changes, network drops, rate limits, and unexpected popups.

**Prompt template:**
```
You are an error handling specialist. Harden this Playwright bot against failures:
Project: /Users/lukashellesch/Desktop/REPOS/TinderBot

File to harden: src/[FILENAME]

Common failure modes:
- Tinder DOM selectors change without warning
- Network timeouts during swipe/message
- "You've run out of likes" modal blocks swiping
- Anthropic API rate limits (429 errors)
- Session cookie expiry mid-session

Add retry logic, graceful degradation, and structured error logging.
Do NOT suppress errors silently.
```

---

## 🧹 Clean Code Review

**Skill:** `clean-coder.skill`

**When to use:** Before committing a large feature. Get a code quality pass.

**Prompt template:**
```
Review the following file for clean code principles:
/Users/lukashellesch/Desktop/REPOS/TinderBot/src/[FILENAME]

Check for:
- Single responsibility violations
- Magic numbers/strings (should be constants)
- Inconsistent naming
- Missing edge case handling
- Dead code

Output: annotated file with fixes applied.
```

---

## 📦 Git & Release

**Skill:** `git-expert.skill`

**When to use:** Setting up branching strategy, creating releases, writing changelogs, managing the GitHub remote.

**Prompt template:**
```
You are a git expert helping manage the RexMatch project.
Repo: /Users/lukashellesch/Desktop/REPOS/TinderBot
Remote: https://github.com/[USERNAME]/RexMatch

Task: [e.g. "create a v1.0.0 release tag with changelog" or "set up branch protection rules"]
```

---

## 📋 Project Planning

**Skill:** `project-planner.skill`

**When to use:** Planning a new sprint of features (e.g. profile scoring, Super Like logic, multi-account support).

**Prompt template:**
```
You are a project planner. Create a feature implementation plan for RexMatch.
Project: /Users/lukashellesch/Desktop/REPOS/TinderBot

New feature: [DESCRIBE FEATURE]

Break it down into:
1. Files to create / modify
2. Ordered implementation steps
3. Dependencies and risks
4. Acceptance criteria
```

---

## 🤖 AI Messaging Improvements

**Skill:** `software-architect.skill` + `refactorer.skill`

**When to use:** Improving Claude prompt quality, adding conversation memory, or supporting different messaging personalities.

**Prompt template:**
```
Improve the AI messaging system in:
/Users/lukashellesch/Desktop/REPOS/TinderBot/src/messenger.js

Current: single-turn prompt with conversation history as text
Goal: [e.g. "add multi-turn conversation memory" or "support persona profiles loaded from JSON"]

Use Anthropic SDK (claude-opus-4-6 model). Keep the existing sendMessage / processMatches API.
```

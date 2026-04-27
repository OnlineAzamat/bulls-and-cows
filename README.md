# X-Code — Multiplayer Bulls & Cows Telegram Bot

> A turn-based multiplayer logic game with a **bluffing mechanic**, built as a Telegram bot.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)](https://www.typescriptlang.org)
[![grammY](https://img.shields.io/badge/grammY-1.x-orange)](https://grammy.dev)

---

## Table of Contents

- [Overview](#overview)
- [Game Rules](#game-rules)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running the Bot](#running-the-bot)
- [Bot Commands](#bot-commands)
- [Deployment](#deployment)
- [License](#license)

---

## Overview

**X-Code** is an advanced, multiplayer version of the classic *Bulls and Cows* number-guessing game, playable entirely inside Telegram. Players join a shared room, each set a secret 4-digit code, and then take turns trying to crack each other's codes. The twist: players can **bluff** about the result — but deception comes with a penalty.

---

## Game Rules

### Setup
1. A host creates a room and shares the Room ID with friends.
2. Each player joins via `/joinroom <ROOM_ID>`.
3. Once all players are in, the host starts the game.
4. Every player privately submits their secret **4-digit code** (no repeated digits).

### Turn Cycle
The game creates a round-robin loop (A → B → C → A). On each turn, the active player submits a 4-digit guess targeting the next player in the cycle.

### Bulls & Cows Logic
| Term | Meaning |
|------|---------|
| 🐂 **Bull** | Correct digit in the correct position |
| 🐄 **Cow**  | Correct digit in the wrong position  |

### The Bluffing Mechanic
After a guess is made, the **defending player** is privately shown the real result and asked:

> *"Tell the truth or Bluff?"*

- A player may **bluff once per game**, sending fake stats to the attacker.
- **3 turns later**, the system automatically exposes the bluff to the entire room:
  - The real stats are revealed.
  - One correct digit and its exact position from the bluffer's code is leaked publicly as a penalty.

### Honest Player Perk (Swap)
After **4 consecutive honest turns**, a player is offered a bonus: swap any two digits in their own secret code, making it harder to crack.

### Elimination & Victory
- A player is eliminated when all 4 digits are guessed correctly (4 Bulls).
- The attacker who eliminated them inherits their target.
- The **last player standing wins**.

---

## Features

- Multi-player rooms (2+ players) with a shared lobby
- Round-robin turn system managed in Redis
- Private bluff/truth prompts via inline keyboards
- Automated bluff exposure after 3 turns
- AFK auto-skip with configurable timeout
- Honest-player swap perk after 4 clean turns
- Leaderboard (`/top`) backed by PostgreSQL
- Player profiles with win/game statistics
- Full localization: **Uzbek** and **Russian**
- Room management: kick players, close room, leave room
- PM2-ready for production deployment

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22+ |
| Language | TypeScript 6.x |
| Bot Framework | [grammY](https://grammy.dev) |
| State / Game Logic | [ioredis](https://github.com/redis/ioredis) (Redis) |
| Database (persistent stats) | PostgreSQL via [Prisma ORM](https://www.prisma.io) |
| Localization | [@grammyjs/i18n](https://github.com/grammyjs/i18n) + Fluent (`.ftl`) |
| Process Manager | [PM2](https://pm2.keymetrics.io) |

---

## Project Structure

```
src/
├── bot.ts                  # Entry point — bot init, middleware, handler registration
├── types.ts                # Shared TypeScript types (RoomPlayer, GameRoom, etc.)
│
├── handlers/
│   ├── start.ts            # /start command, language selection
│   ├── room.ts             # /createroom, /joinroom, /leaveroom, /closeroom
│   ├── game.ts             # Game loop, guessing, bluff, swap perk, AFK handling
│   ├── profile.ts          # /profile command
│   └── top.ts              # /top leaderboard command
│
├── services/
│   ├── roomService.ts      # All Redis operations (room state, turns, bluff queue)
│   └── userService.ts      # Prisma DB operations (upsert user, stats update)
│
├── middleware/
│   └── locale.ts           # Per-user language resolution middleware
│
├── utils/
│   ├── bullsAndCows.ts     # Pure calculateBullsAndCows(guess, secret) function
│   ├── i18n.ts             # i18n helpers
│   └── localeCache.ts      # Redis-backed locale cache
│
├── db/
│   ├── prisma.ts           # Prisma client singleton
│   └── redis.ts            # ioredis client singleton
│
└── locales/
    ├── uz.ftl              # Uzbek translations
    └── ru.ftl              # Russian translations

prisma/
└── schema.prisma           # User model schema
```

---

## Getting Started

### Prerequisites

- **Node.js** 22 or higher
- **Redis** server (local or remote)
- **PostgreSQL** database
- A Telegram Bot token from [@BotFather](https://t.me/BotFather)

### Installation

```bash
git clone https://github.com/OnlineAzamat/bulls-and-cows.git
cd bulls-and-cows
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Telegram
BOT_TOKEN=your_telegram_bot_token_here

# PostgreSQL (Prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/xcode

# Redis
REDIS_URL=redis://localhost:6379
```

### Database Setup

```bash
# Generate Prisma client and push schema to the database
npx prisma generate
npx prisma db push
```

### Running the Bot

**Development (with ts-node):**
```bash
npm run dev
```

**Production (compiled JS):**
```bash
npm run build
npm start
```

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome screen & language selection |
| `/createroom` | Create a new game room |
| `/joinroom <ID>` | Join an existing room by its ID |
| `/leaveroom` | Leave the current room (lobby only) |
| `/closeroom` | Disband the room (host only) |
| `/profile` | View your personal stats |
| `/top` | Show the global leaderboard |

---

## Deployment

The project ships with an `ecosystem.config.js` for [PM2](https://pm2.keymetrics.io):

```bash
# Install PM2 globally
npm install -g pm2

# Build the project first
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 process list for auto-restart on reboot
pm2 save
pm2 startup
```

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

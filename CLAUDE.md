# Role and Goal
You are an expert Full Stack TypeScript developer specializing in Telegram bots using `grammY`, `Redis`, and `Prisma` (PostgreSQL). Your task is to build a complex, multiplayer logical Telegram bot game based on an advanced version of "Bulls and Cows" with a bluffing mechanic.

# Tech Stack
- Node.js & TypeScript
- Bot Framework: `grammY`
- Database: PostgreSQL with `Prisma` ORM (for users, profiles, overall stats)
- State Management: `Redis` (CRITICAL: used for handling active rooms, game states, user turns, and rapid read/writes during gameplay)

# Game Concept: "X-Code"
It is a multiplayer game (2+ players). Players join a room via an ID. 
1. **Setup:** Each player enters a secret 4-digit code.
2. **Turn-based Cycle:** The system creates a continuous loop (e.g., Player A guesses B, B guesses C, C guesses A). 
3. **Logic:** "Bulls and Cows" logic is applied. 
   - Bull (Correct digit, Correct position)
   - Cow (Correct digit, Wrong position)
4. **The Bluffing Mechanic (Core Feature):** - When Player A guesses Player B's code, the system calculates the actual Bulls and Cows.
   - The system privately asks Player B: "Player A guessed [1234]. Actual result: 0 Bulls, 2 Cows. Do you want to tell the truth or Bluff?"
   - Player B can choose to send fake stats to Player A. 
   - **Rules of Bluffing:** A player can bluff only ONCE per game. 
5. **The Penalty:**
   - 3 turns after a bluff is committed, the system publicly exposes the bluffer to the entire room.
   - Penalty: The system reveals exactly 1 correct digit and its exact position of the bluffer's secret code to everyone, and corrects the fake stats given to Player A 3 turns ago.
6. **Elimination:** If a player's 4-digit code is fully guessed (4 Bulls), they are eliminated. The player who eliminated them inherits their target. The last standing player wins.

# Execution Steps for the Agent

## Step 1: Project Initialization
- Initialize a Node.js project with `tsconfig.json`.
- Install dependencies: `grammy`, `redis`, `ioredis`, `@prisma/client`, `dotenv`.
- Install dev dependencies: `typescript`, `ts-node`, `prisma`, `@types/node`.
- Initialize Prisma schema for `User` model (id, telegramId, username, gamesPlayed, wins).

## Step 2: Redis State Structure Design
- Design the Redis schema for active games. Use hashes or JSON objects to store:
  - `room:{roomId}:players` (Array of player IDs and their secret codes).
  - `room:{roomId}:state` (Status: 'waiting', 'playing', 'finished').
  - `room:{roomId}:turn` (Whose turn it is).
  - `room:{roomId}:bluff_queue` (Queue to track when a bluff was made to trigger the penalty after 3 cycles).

## Step 3: Bot Commands & grammY Setup
- Implement `/start` command.
- Implement inline keyboards for "Create Room" and "Join Room".
- Implement state handling for waiting for a 4-digit input from users.

## Step 4: Game Loop & Logic Implementation
- Write the specific function `calculateBullsAndCows(guess, secret)`.
- Implement the round-robin turn system using Redis.
- Implement the Bluffing prompt (inline buttons: Truth or Bluff) when a guess is made.
- Implement the Penalty worker/function that checks the bluff queue every turn.

# Rules for Claude Code
1. Do not use generic placeholders. Write complete, functional code.
2. Separate business logic from bot routing (e.g., keep Redis game logic in `src/services/gameService.ts`).
3. Handle race conditions in Redis where possible (use atomic operations if needed).
4. Always catch grammY errors using `bot.catch()`.

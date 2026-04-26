import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types";
import { i18n } from "../utils/i18n";
import { calculateBullsAndCows } from "../utils/bullsAndCows";
import {
  getPlayerRoom,
  getRoom,
  submitSecretCode,
  setPendingGuess,
  getPendingGuess,
  clearPendingGuess,
  setAwaitingBluff,
  getAwaitingBluff,
  clearAwaitingBluff,
  advanceTurn,
  recordBluff,
  RoomData,
  RoomPlayer,
  PendingGuess,
  BluffRecord,
} from "../services/roomService";

// ── Shared helpers ────────────────────────────────────────────────────────────

function tFor(
  player: RoomPlayer,
  key: string,
  vars?: Record<string, string>
): string {
  return i18n.t(player.languageCode, key, vars);
}

function displayName(player: RoomPlayer): string {
  return player.username ? `@${player.username}` : player.firstName;
}

function resolveCurrentTurn(
  room: RoomData
): { attacker: RoomPlayer; target: RoomPlayer } | null {
  if (!room.turnOrder || !room.currentAttackerId) return null;
  const entry = room.turnOrder.find(
    (e) => e.attackerId === room.currentAttackerId
  );
  if (!entry) return null;
  const attacker = room.players.find((p) => p.telegramId === entry.attackerId);
  const target = room.players.find((p) => p.telegramId === entry.targetId);
  if (!attacker || !target) return null;
  return { attacker, target };
}

async function sendTurnPrompt(ctx: MyContext, room: RoomData): Promise<void> {
  const turn = resolveCurrentTurn(room);
  if (!turn) return;

  const { attacker, target } = turn;
  try {
    await ctx.api.sendMessage(
      Number(attacker.telegramId),
      tFor(attacker, "your-turn", {
        targetName: displayName(target),
        roomId: room.roomId,
      }),
      { parse_mode: "HTML" }
    );
  } catch { /* player blocked the bot */ }
}

// ── Phase 4: secret-code collection ──────────────────────────────────────────

async function broadcastGameStart(ctx: MyContext, room: RoomData): Promise<void> {
  for (const player of room.players) {
    try {
      await ctx.api.sendMessage(
        Number(player.telegramId),
        tFor(player, "all-codes-collected", { roomId: room.roomId }),
        { parse_mode: "HTML" }
      );
    } catch { /* blocked */ }
  }
  await sendTurnPrompt(ctx, room);
}

async function handleCodeCollection(
  ctx: MyContext,
  telegramId: string,
  roomId: string,
  code: string
): Promise<void> {
  const result = await submitSecretCode(roomId, telegramId, code);

  if (!result.success) {
    if (result.reason === "CODE_ALREADY_SET") {
      await ctx.reply(ctx.t("code-already-set"));
    }
    return;
  }

  await ctx.reply(ctx.t("code-accepted"));
  if (result.allCollected) {
    await broadcastGameStart(ctx, result.room);
  }
}

// ── Phase 5: turn-based guessing ──────────────────────────────────────────────

async function handleGuess(
  ctx: MyContext,
  telegramId: string,
  roomId: string,
  guess: string,
  room: RoomData
): Promise<void> {
  if (room.currentAttackerId !== telegramId) {
    await ctx.reply(ctx.t("not-your-turn"));
    return;
  }

  const entry = room.turnOrder?.find((e) => e.attackerId === telegramId);
  const target = entry
    ? room.players.find((p) => p.telegramId === entry.targetId)
    : undefined;

  if (!target?.secretCode) return; // defensive — should never happen in valid game

  const { bulls, cows } = calculateBullsAndCows(guess, target.secretCode);
  const attacker = room.players.find((p) => p.telegramId === telegramId)!;

  // Persist the pending guess before messaging target
  const pending: PendingGuess = {
    roomId,
    attackerId: telegramId,
    targetId: target.telegramId,
    guess,
    realBulls: bulls,
    realCows: cows,
  };
  await setPendingGuess(roomId, pending);

  // Acknowledge to attacker
  await ctx.reply(ctx.t("guess-sent", { targetName: displayName(target) }), {
    parse_mode: "HTML",
  });

  // Ask target: Truth or Bluff?
  const keyboard = new InlineKeyboard()
    .text(tFor(target, "btn-tell-truth"), `truth:${roomId}`)
    .text(tFor(target, "btn-bluff"), `bluff:${roomId}`);

  try {
    await ctx.api.sendMessage(
      Number(target.telegramId),
      tFor(target, "bluff-or-truth-prompt", {
        attackerName: displayName(attacker),
        guess,
        bulls: String(bulls),
        cows: String(cows),
      }),
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  } catch { /* target blocked bot */ }
}

// Shared truth-processing used by both the truth callback and the
// "already bluffed" branch of the bluff callback.
async function processTruth(
  ctx: MyContext,
  roomId: string,
  pending: PendingGuess,
  room: RoomData
): Promise<void> {
  const attacker = room.players.find((p) => p.telegramId === pending.attackerId)!;
  const target = room.players.find((p) => p.telegramId === pending.targetId)!;

  // Send the real result to the attacker in their language
  try {
    await ctx.api.sendMessage(
      Number(attacker.telegramId),
      tFor(attacker, "guess-result", {
        targetName: displayName(target),
        guess: pending.guess,
        bulls: String(pending.realBulls),
        cows: String(pending.realCows),
      }),
      { parse_mode: "HTML" }
    );
  } catch { /* blocked */ }

  await clearPendingGuess(roomId);
  const updatedRoom = await advanceTurn(roomId);
  if (updatedRoom) await sendTurnPrompt(ctx, updatedRoom);
}

async function handleFakeStatsInput(
  ctx: MyContext,
  telegramId: string,
  roomId: string,
  text: string
): Promise<void> {
  // Accept format "X Y" where each is a single digit 0–4 and X+Y ≤ 4
  const match = text.match(/^([0-4])\s+([0-4])$/);
  if (!match) {
    await ctx.reply(ctx.t("invalid-fake-stats"), { parse_mode: "HTML" });
    return;
  }

  const fakeBulls = Number(match[1]);
  const fakeCows = Number(match[2]);

  if (fakeBulls + fakeCows > 4) {
    await ctx.reply(ctx.t("invalid-fake-stats"), { parse_mode: "HTML" });
    return;
  }

  const pending = await getPendingGuess(roomId);
  if (!pending) {
    await clearAwaitingBluff(telegramId);
    await ctx.reply(ctx.t("session-expired"));
    return;
  }

  const room = await getRoom(roomId);
  if (!room) {
    await clearAwaitingBluff(telegramId);
    return;
  }

  const attacker = room.players.find((p) => p.telegramId === pending.attackerId)!;
  const bluffer = room.players.find((p) => p.telegramId === telegramId)!;

  // Send FAKE result to attacker in their language
  try {
    await ctx.api.sendMessage(
      Number(attacker.telegramId),
      tFor(attacker, "guess-result", {
        targetName: displayName(bluffer),
        guess: pending.guess,
        bulls: String(fakeBulls),
        cows: String(fakeCows),
      }),
      { parse_mode: "HTML" }
    );
  } catch { /* blocked */ }

  // Persist the bluff record
  const bluffRecord: BluffRecord = {
    blufferId: telegramId,
    attackerId: pending.attackerId,
    guess: pending.guess,
    realBulls: pending.realBulls,
    realCows: pending.realCows,
    fakeBulls,
    fakeCows,
    committedOnTurn: room.turnNumber ?? 0,
    penaltyOnTurn: (room.turnNumber ?? 0) + 3,
    exposed: false,
  };
  await recordBluff(roomId, bluffRecord);

  await ctx.reply(ctx.t("bluff-registered"), { parse_mode: "HTML" });

  await clearAwaitingBluff(telegramId);
  await clearPendingGuess(roomId);

  const updatedRoom = await advanceTurn(roomId);
  if (updatedRoom) await sendTurnPrompt(ctx, updatedRoom);
}

// ── Handler registration ──────────────────────────────────────────────────────

export function registerGameHandlers(bot: Bot<MyContext>): void {
  // ── Truth callback ───────────────────────────────────────────────────────
  bot.callbackQuery(/^truth:(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const telegramId = String(ctx.from.id);

    const pending = await getPendingGuess(roomId);
    if (!pending) {
      await ctx.answerCallbackQuery({
        text: ctx.t("session-expired"),
        show_alert: true,
      });
      return;
    }
    if (pending.targetId !== telegramId) {
      await ctx.answerCallbackQuery({
        text: ctx.t("not-your-turn"),
        show_alert: true,
      });
      return;
    }

    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    } catch { /* already edited */ }

    await ctx.reply(ctx.t("you-chose-truth"), { parse_mode: "HTML" });

    const room = await getRoom(roomId);
    if (room) await processTruth(ctx, roomId, pending, room);
  });

  // ── Bluff callback ───────────────────────────────────────────────────────
  bot.callbackQuery(/^bluff:(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const telegramId = String(ctx.from.id);

    const pending = await getPendingGuess(roomId);
    if (!pending) {
      await ctx.answerCallbackQuery({
        text: ctx.t("session-expired"),
        show_alert: true,
      });
      return;
    }
    if (pending.targetId !== telegramId) {
      await ctx.answerCallbackQuery({
        text: ctx.t("not-your-turn"),
        show_alert: true,
      });
      return;
    }

    const room = await getRoom(roomId);
    if (!room) return;

    const bluffer = room.players.find((p) => p.telegramId === telegramId);

    // Player already used their one bluff — fall back to truth
    if (bluffer?.hasBluffed) {
      await ctx.answerCallbackQuery({
        text: ctx.t("bluff-already-used"),
        show_alert: true,
      });
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      } catch { /* already edited */ }
      await processTruth(ctx, roomId, pending, room);
      return;
    }

    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    } catch { /* already edited */ }

    await setAwaitingBluff(telegramId, roomId);
    await ctx.reply(ctx.t("enter-fake-stats"), { parse_mode: "HTML" });
  });

  // ── All text messages: routes by priority ────────────────────────────────
  //
  // Priority 1: user is in the "enter fake bluff stats" flow
  // Priority 2: 4-digit input → secret code (collecting_codes) or guess (playing)
  //
  // Using bot.on("message:text") rather than bot.hears() keeps all text routing
  // in one place and avoids double-firing for messages that match both filters.
  bot.on("message:text", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const telegramId = String(from.id);
    const text = ctx.message.text.trim();

    // Priority 1: awaiting fake bluff stats
    const awaitingRoomId = await getAwaitingBluff(telegramId);
    if (awaitingRoomId) {
      await handleFakeStatsInput(ctx, telegramId, awaitingRoomId, text);
      return;
    }

    // Priority 2: exactly 4 digits
    if (!/^\d{4}$/.test(text)) return;

    const roomId = await getPlayerRoom(telegramId);
    if (!roomId) return;

    const room = await getRoom(roomId);
    if (!room) return;

    if (room.status === "collecting_codes") {
      await handleCodeCollection(ctx, telegramId, roomId, text);
    } else if (room.status === "playing") {
      await handleGuess(ctx, telegramId, roomId, text, room);
    }
  });
}

import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types";
import { i18n } from "../utils/i18n";
import { calculateBullsAndCows } from "../utils/bullsAndCows";
import { prisma } from "../db/prisma";
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
  setAwaitingSwap,
  getAwaitingSwap,
  clearAwaitingSwap,
  advanceTurn,
  recordBluff,
  eliminatePlayer,
  markBluffExposed,
  cleanupRoom,
  setRoomStatus,
  incrementHonestCycles,
  resetHonestCycles,
  swapCodeDigits,
  setUiMsg,
  getUiMsg,
  delUiMsg,
  RoomData,
  RoomPlayer,
  PendingGuess,
  BluffRecord,
} from "../services/roomService";

// ── Constants ─────────────────────────────────────────────────────────────────

const TURN_TIMEOUT_MS  = 2 * 60 * 1_000;
const BLUFF_TIMEOUT_MS = 2 * 60 * 1_000;

// ── Timer management ──────────────────────────────────────────────────────────
// Keys encode (type, roomId, turnNumber) so stale timers never double-fire.

const activeTimers = new Map<string, NodeJS.Timeout>();

function setTimer(key: string, ms: number, cb: () => void): void {
  const old = activeTimers.get(key);
  if (old) clearTimeout(old);
  activeTimers.set(key, setTimeout(() => {
    activeTimers.delete(key);
    cb();
  }, ms));
}

function cancelTimer(key: string): void {
  const t = activeTimers.get(key);
  if (t) { clearTimeout(t); activeTimers.delete(key); }
}

function turnKey(roomId: string, turn: number): string { return `turn:${roomId}:${turn}`; }
function bluffKey(roomId: string, turn: number): string { return `bluff:${roomId}:${turn}`; }

// ── Pure helpers ──────────────────────────────────────────────────────────────

function tFor(p: RoomPlayer, key: string, vars?: Record<string, string>): string {
  return i18n.t(p.languageCode, key, vars);
}

function displayName(p: RoomPlayer): string {
  return p.username ? `@${p.username}` : p.firstName;
}

function resolveCurrentTurn(room: RoomData): { attacker: RoomPlayer; target: RoomPlayer } | null {
  if (!room.turnOrder || !room.currentAttackerId) return null;
  const e = room.turnOrder.find(e => e.attackerId === room.currentAttackerId);
  if (!e) return null;
  const attacker = room.players.find(p => p.telegramId === e.attackerId);
  const target   = room.players.find(p => p.telegramId === e.targetId);
  if (!attacker || !target) return null;
  return { attacker, target };
}

// ── Game Board & Micro-Action Broadcasts ──────────────────────────────────────

async function broadcastGameBoard(bot: Bot<MyContext>, room: RoomData): Promise<void> {
  const turn = resolveCurrentTurn(room);
  if (!turn) return;
  const { attacker, target } = turn;

  for (const p of room.players.filter(pl => !pl.eliminated)) {
    const lang = p.languageCode;

    const lines: string[] = [];
    let pos = 1;
    for (const entry of (room.turnOrder ?? [])) {
      const player = room.players.find(pl => pl.telegramId === entry.attackerId);
      if (!player) continue;
      const isActive = entry.attackerId === room.currentAttackerId;
      lines.push(
        isActive
          ? i18n.t(lang, "game-board-status-active",   { position: String(pos++), name: displayName(player) })
          : i18n.t(lang, "game-board-status-waiting",  { position: String(pos++), name: displayName(player) })
      );
    }
    for (const ep of room.players.filter(pl => pl.eliminated)) {
      lines.push(i18n.t(lang, "game-board-status-eliminated", { name: displayName(ep) }));
    }

    const action = i18n.t(lang, "game-board-action-guessing", {
      attackerName: displayName(attacker),
      targetName:   displayName(target),
    });
    const text = i18n.t(lang, "game-board", { action, sequence: lines.join("\n") });

    // Delete the previous floating game board so only one exists at a time
    const oldId = await getUiMsg("game_board", p.telegramId);
    if (oldId) {
      try { await bot.api.deleteMessage(Number(p.telegramId), oldId); } catch { /* already gone */ }
      await delUiMsg("game_board", p.telegramId);
    }

    try {
      const sent = await bot.api.sendMessage(Number(p.telegramId), text, { parse_mode: "HTML" });
      await setUiMsg("game_board", p.telegramId, sent.message_id);
    } catch { /* blocked */ }
  }
}

async function broadcastMicroAction(
  bot: Bot<MyContext>,
  room: RoomData,
  key: string,
  vars: Record<string, string>,
  storeAs?: "broadcast_action"
): Promise<void> {
  for (const p of room.players.filter(pl => !pl.eliminated)) {
    try {
      const sent = await bot.api.sendMessage(Number(p.telegramId), tFor(p, key, vars), { parse_mode: "HTML" });
      if (storeAs) await setUiMsg(storeAs, p.telegramId, sent.message_id);
    } catch { /* blocked */ }
  }
}

// Edit each player's stored broadcast_action message in-place (no new message sent).
async function editBroadcastForAll(
  bot: Bot<MyContext>,
  room: RoomData,
  key: string,
  vars: Record<string, string>
): Promise<void> {
  for (const p of room.players.filter(pl => !pl.eliminated)) {
    const msgId = await getUiMsg("broadcast_action", p.telegramId);
    if (!msgId) continue;
    try {
      await bot.api.editMessageText(Number(p.telegramId), msgId, tFor(p, key, vars), { parse_mode: "HTML" });
    } catch { /* too old or already deleted — gracefully ignore */ }
    await delUiMsg("broadcast_action", p.telegramId);
  }
}

// Edit the attacker's "waiting for result" message to show the final result.
// Falls back to sending a new message if the stored ID is missing or stale.
async function deliverGuessResult(
  bot: Bot<MyContext>,
  attacker: RoomPlayer,
  target: RoomPlayer,
  guess: string,
  bulls: number,
  cows: number
): Promise<void> {
  const text = tFor(attacker, "guess-result", {
    targetName: displayName(target), guess, bulls: String(bulls), cows: String(cows),
  });
  const msgId = await getUiMsg("guess_waiting", attacker.telegramId);
  if (msgId) {
    try {
      await bot.api.editMessageText(Number(attacker.telegramId), msgId, text, { parse_mode: "HTML" });
      await delUiMsg("guess_waiting", attacker.telegramId);
      return;
    } catch { /* stale — fall through to send fresh */ }
    await delUiMsg("guess_waiting", attacker.telegramId);
  }
  try { await bot.api.sendMessage(Number(attacker.telegramId), text, { parse_mode: "HTML" }); } catch { /* blocked */ }
}

// ── Bot-based helpers (work both from handlers and from timer callbacks) ───────

async function sendTurnPrompt(bot: Bot<MyContext>, room: RoomData): Promise<void> {
  const turn = resolveCurrentTurn(room);
  if (!turn) return;
  const { attacker, target } = turn;
  const tNum = room.turnNumber ?? 0;

  // Broadcast visual game board to all active players before prompting the next attacker
  await broadcastGameBoard(bot, room);

  // Offer swap perk if earned
  if (attacker.swapPerkAvailable) {
    const kb = new InlineKeyboard().text(
      tFor(attacker, "btn-use-swap-perk"),
      `claim_swap:${room.roomId}`
    );
    try {
      await bot.api.sendMessage(
        Number(attacker.telegramId),
        tFor(attacker, "swap-perk-offer"),
        { parse_mode: "HTML", reply_markup: kb }
      );
    } catch { /* blocked */ }
  }

  try {
    const sent = await bot.api.sendMessage(
      Number(attacker.telegramId),
      tFor(attacker, "your-turn", { targetName: displayName(target), roomId: room.roomId }),
      { parse_mode: "HTML" }
    );
    await setUiMsg("turn_prompt", attacker.telegramId, sent.message_id);
  } catch { /* blocked */ }

  setTimer(turnKey(room.roomId, tNum), TURN_TIMEOUT_MS, () => {
    void handleTurnAFK(bot, room.roomId, attacker.telegramId, tNum);
  });
}

async function applyBluffPenalty(
  bot: Bot<MyContext>,
  room: RoomData,
  bluff: BluffRecord
): Promise<void> {
  const bluffer = room.players.find(p => p.telegramId === bluff.blufferId);
  if (!bluffer?.secretCode) return;
  const deceived = room.players.find(p => p.telegramId === bluff.attackerId) ?? bluffer;

  for (const p of room.players.filter(p => !p.eliminated)) {
    try {
      await bot.api.sendMessage(
        Number(p.telegramId),
        tFor(p, "bluff-penalty", {
          blufferName:  displayName(bluffer),
          attackerName: displayName(deceived),
          guess:        bluff.guess,
          realBulls:    String(bluff.realBulls),
          realCows:     String(bluff.realCows),
          fakeBulls:    String(bluff.fakeBulls),
          fakeCows:     String(bluff.fakeCows),
          position:     "1",
          digit:        bluffer.secretCode[0],
        }),
        { parse_mode: "HTML" }
      );
    } catch { /* blocked */ }
  }
}

async function checkAndApplyBluffPenalties(
  bot: Bot<MyContext>,
  room: RoomData
): Promise<void> {
  if (!room.bluffQueue?.length) return;
  const cur = room.turnNumber ?? 0;
  for (const bluff of room.bluffQueue.filter(b => !b.exposed && cur >= b.penaltyOnTurn)) {
    await applyBluffPenalty(bot, room, bluff);
    await markBluffExposed(room.roomId, bluff.blufferId);
  }
}

async function broadcastEndGame(
  bot: Bot<MyContext>,
  room: RoomData,
  winner: RoomPlayer
): Promise<void> {
  await setRoomStatus(room.roomId, "finished");

  for (const p of room.players) {
    try {
      await bot.api.sendMessage(
        Number(p.telegramId),
        tFor(p, "game-winner", { winnerName: displayName(winner), roomId: room.roomId }),
        { parse_mode: "HTML" }
      );
    } catch { /* blocked */ }
  }

  for (const p of room.players) {
    try {
      await prisma.user.update({
        where: { telegramId: BigInt(p.telegramId) },
        data: {
          gamesPlayed: { increment: 1 },
          ...(p.telegramId === winner.telegramId ? { wins: { increment: 1 } } : {}),
        },
      });
    } catch { /* user not in DB */ }
  }

  await cleanupRoom(room.roomId, room.players);
}

async function handleElimination(
  bot: Bot<MyContext>,
  ctx: MyContext,
  roomId: string,
  room: RoomData,
  attacker: RoomPlayer,
  target: RoomPlayer,
  guess: string
): Promise<void> {
  cancelTimer(turnKey(roomId, room.turnNumber ?? 0));

  for (const p of room.players) {
    try {
      await bot.api.sendMessage(
        Number(p.telegramId),
        tFor(p, "player-eliminated", {
          attackerName: displayName(attacker),
          targetName:   displayName(target),
          guess,
        }),
        { parse_mode: "HTML" }
      );
    } catch { /* blocked */ }
  }

  try {
    await bot.api.sendMessage(
      Number(attacker.telegramId),
      tFor(attacker, "you-cracked-code", {
        targetName: displayName(target),
        code: target.secretCode ?? "????",
      }),
      { parse_mode: "HTML" }
    );
  } catch { /* blocked */ }

  const activeCount = await eliminatePlayer(roomId, target.telegramId, attacker.telegramId);
  if (activeCount === null) return;

  if (activeCount <= 1) {
    const updated = await getRoom(roomId);
    if (!updated) return;
    const winner = updated.players.find(p => !p.eliminated);
    if (winner) await broadcastEndGame(bot, updated, winner);
    return;
  }

  const updated = await getRoom(roomId);
  if (!updated) return;
  await checkAndApplyBluffPenalties(bot, updated);
  await sendTurnPrompt(bot, updated);
}

// ── AFK handlers (called from timers, no ctx) ─────────────────────────────────

async function handleTurnAFK(
  bot: Bot<MyContext>,
  roomId: string,
  attackerId: string,
  expectedTurn: number
): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || room.status !== "playing") return;
  if (room.currentAttackerId !== attackerId) return;
  if ((room.turnNumber ?? 0) !== expectedTurn) return;

  const attacker = room.players.find(p => p.telegramId === attackerId);
  if (!attacker) return;

  await clearAwaitingSwap(attackerId);

  // Delete the stale "your turn" prompt that was never answered
  const promptId = await getUiMsg("turn_prompt", attackerId);
  if (promptId) {
    try { await bot.api.deleteMessage(Number(attackerId), promptId); } catch { /* already gone */ }
    await delUiMsg("turn_prompt", attackerId);
  }

  for (const p of room.players.filter(p => !p.eliminated)) {
    try {
      await bot.api.sendMessage(
        Number(p.telegramId),
        tFor(p, "turn-skipped-afk", { playerName: displayName(attacker) }),
        { parse_mode: "HTML" }
      );
    } catch { /* blocked */ }
  }

  const updated = await advanceTurn(roomId);
  if (updated) {
    await checkAndApplyBluffPenalties(bot, updated);
    await sendTurnPrompt(bot, updated);
  }
}

async function handleBluffAFK(
  bot: Bot<MyContext>,
  roomId: string,
  targetId: string,
  expectedTurn: number
): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || room.status !== "playing") return;
  if ((room.turnNumber ?? 0) !== expectedTurn) return;

  const pending = await getPendingGuess(roomId);
  if (!pending || pending.targetId !== targetId) return;

  const attacker = room.players.find(p => p.telegramId === pending.attackerId);
  const target   = room.players.find(p => p.telegramId === targetId);
  if (!attacker || !target) return;

  await clearAwaitingBluff(targetId);

  try {
    await bot.api.sendMessage(
      Number(targetId),
      tFor(target, "bluff-timeout-auto-truth"),
      { parse_mode: "HTML" }
    );
  } catch { /* blocked */ }

  // Edit the attacker's waiting message to show the real result
  await deliverGuessResult(bot, attacker, target, pending.guess, pending.realBulls, pending.realCows);

  await clearPendingGuess(roomId);
  await incrementHonestCycles(roomId, targetId);

  // Edit each player's broadcast action message to show target responded
  await editBroadcastForAll(bot, room, "broadcast-target-responded", {
    targetName: displayName(target),
  });

  const updated = await advanceTurn(roomId);
  if (updated) {
    await checkAndApplyBluffPenalties(bot, updated);
    await sendTurnPrompt(bot, updated);
  }
}

// ── Code collection ───────────────────────────────────────────────────────────

async function broadcastGameStart(bot: Bot<MyContext>, room: RoomData): Promise<void> {
  for (const p of room.players) {
    try {
      await bot.api.sendMessage(
        Number(p.telegramId),
        tFor(p, "all-codes-collected", { roomId: room.roomId }),
        { parse_mode: "HTML" }
      );
    } catch { /* blocked */ }
  }
  await sendTurnPrompt(bot, room);
}

async function handleCodeCollection(
  ctx: MyContext,
  bot: Bot<MyContext>,
  telegramId: string,
  roomId: string,
  code: string
): Promise<void> {
  const result = await submitSecretCode(roomId, telegramId, code);
  if (!result.success) {
    if (result.reason === "CODE_ALREADY_SET") await ctx.reply(ctx.t("code-already-set"));
    return;
  }
  await ctx.reply(ctx.t("code-accepted"));
  if (result.allCollected) await broadcastGameStart(bot, result.room);
}

// ── Turn-based guessing ───────────────────────────────────────────────────────

async function handleGuess(
  ctx: MyContext,
  bot: Bot<MyContext>,
  telegramId: string,
  roomId: string,
  guess: string,
  room: RoomData
): Promise<void> {
  if (room.currentAttackerId !== telegramId) {
    await ctx.reply(ctx.t("not-your-turn"));
    return;
  }

  cancelTimer(turnKey(roomId, room.turnNumber ?? 0));

  // Delete the "your turn" prompt now that the player has responded
  const promptId = await getUiMsg("turn_prompt", telegramId);
  if (promptId) {
    try { await bot.api.deleteMessage(Number(telegramId), promptId); } catch { /* already gone */ }
    await delUiMsg("turn_prompt", telegramId);
  }

  const entry  = room.turnOrder?.find(e => e.attackerId === telegramId);
  const target = entry ? room.players.find(p => p.telegramId === entry.targetId) : undefined;
  if (!target?.secretCode) return;

  const { bulls, cows } = calculateBullsAndCows(guess, target.secretCode);
  const attacker = room.players.find(p => p.telegramId === telegramId)!;

  if (bulls === 4) {
    await handleElimination(bot, ctx, roomId, room, attacker, target, guess);
    return;
  }

  await setPendingGuess(roomId, { roomId, attackerId: telegramId, targetId: target.telegramId, guess, realBulls: bulls, realCows: cows });

  // Send "waiting for result" and store the ID so we can edit it later
  try {
    const sent = await ctx.reply(ctx.t("guess-sent", { targetName: displayName(target) }), { parse_mode: "HTML" });
    await setUiMsg("guess_waiting", telegramId, sent.message_id);
  } catch { /* blocked */ }

  // Notify everyone that a guess was made — store per-player so we can edit it later
  await broadcastMicroAction(bot, room, "broadcast-guess-made", {
    guesserName: displayName(attacker),
    targetName:  displayName(target),
  }, "broadcast_action");

  const kb = new InlineKeyboard().text(tFor(target, "btn-tell-truth"), `truth:${roomId}`);
  if (!target.hasBluffed) kb.text(tFor(target, "btn-bluff"), `bluff:${roomId}`);

  try {
    await bot.api.sendMessage(
      Number(target.telegramId),
      tFor(target, "bluff-or-truth-prompt", {
        attackerName: displayName(attacker), guess,
        bulls: String(bulls), cows: String(cows),
      }),
      { parse_mode: "HTML", reply_markup: kb }
    );
  } catch { /* blocked */ }

  setTimer(bluffKey(roomId, room.turnNumber ?? 0), BLUFF_TIMEOUT_MS, () => {
    void handleBluffAFK(bot, roomId, target.telegramId, room.turnNumber ?? 0);
  });
}

async function processTruth(
  bot: Bot<MyContext>,
  roomId: string,
  pending: PendingGuess,
  room: RoomData
): Promise<void> {
  cancelTimer(bluffKey(roomId, room.turnNumber ?? 0));

  const attacker = room.players.find(p => p.telegramId === pending.attackerId)!;
  const target   = room.players.find(p => p.telegramId === pending.targetId)!;

  // Edit the attacker's waiting message in-place with the real result
  await deliverGuessResult(bot, attacker, target, pending.guess, pending.realBulls, pending.realCows);

  await clearPendingGuess(roomId);
  await incrementHonestCycles(roomId, pending.targetId);

  // Edit each player's broadcast action message to show the turn moved on
  await editBroadcastForAll(bot, room, "broadcast-target-responded", {
    targetName: displayName(target),
  });

  const updated = await advanceTurn(roomId);
  if (updated) {
    await checkAndApplyBluffPenalties(bot, updated);
    await sendTurnPrompt(bot, updated);
  }
}

async function handleFakeStatsInput(
  ctx: MyContext,
  bot: Bot<MyContext>,
  telegramId: string,
  roomId: string,
  text: string
): Promise<void> {
  const m = text.match(/^([0-4])\s+([0-4])$/);
  if (!m || Number(m[1]) + Number(m[2]) > 4) {
    await ctx.reply(ctx.t("invalid-fake-stats"), { parse_mode: "HTML" });
    return;
  }

  const fakeBulls = Number(m[1]);
  const fakeCows  = Number(m[2]);

  const pending = await getPendingGuess(roomId);
  if (!pending) {
    await clearAwaitingBluff(telegramId);
    await ctx.reply(ctx.t("session-expired"));
    return;
  }

  const room = await getRoom(roomId);
  if (!room) { await clearAwaitingBluff(telegramId); return; }

  cancelTimer(bluffKey(roomId, room.turnNumber ?? 0));

  const attacker = room.players.find(p => p.telegramId === pending.attackerId)!;
  const bluffer  = room.players.find(p => p.telegramId === telegramId)!;

  // Edit the attacker's waiting message with the (fake) result
  await deliverGuessResult(bot, attacker, bluffer, pending.guess, fakeBulls, fakeCows);

  const bluffRecord: BluffRecord = {
    blufferId: telegramId, attackerId: pending.attackerId,
    guess: pending.guess,
    realBulls: pending.realBulls, realCows: pending.realCows,
    fakeBulls, fakeCows,
    committedOnTurn: room.turnNumber ?? 0,
    penaltyOnTurn: (room.turnNumber ?? 0) + 3,
    exposed: false,
  };
  await recordBluff(roomId, bluffRecord);
  await resetHonestCycles(roomId, telegramId);

  await ctx.reply(ctx.t("bluff-registered"), { parse_mode: "HTML" });
  await clearAwaitingBluff(telegramId);
  await clearPendingGuess(roomId);

  // Edit each player's broadcast action message (without revealing the bluff)
  await editBroadcastForAll(bot, room, "broadcast-target-responded", {
    targetName: displayName(bluffer),
  });

  const updated = await advanceTurn(roomId);
  if (updated) {
    await checkAndApplyBluffPenalties(bot, updated);
    await sendTurnPrompt(bot, updated);
  }
}

// ── Swap perk input ───────────────────────────────────────────────────────────

async function handleSwapInput(
  ctx: MyContext,
  bot: Bot<MyContext>,
  telegramId: string,
  roomId: string,
  text: string
): Promise<void> {
  const m = text.match(/^([1-4])\s+([1-4])$/);
  if (!m || m[1] === m[2]) {
    await ctx.reply(ctx.t("swap-perk-invalid-positions"), { parse_mode: "HTML" });
    return;
  }

  const newCode = await swapCodeDigits(roomId, telegramId, Number(m[1]), Number(m[2]));
  await clearAwaitingSwap(telegramId);

  if (!newCode) {
    await ctx.reply(ctx.t("swap-perk-expired"));
    return;
  }

  await ctx.reply(ctx.t("swap-perk-used"), { parse_mode: "HTML" });

  const room = await getRoom(roomId);
  if (room) {
    const swapper = room.players.find(p => p.telegramId === telegramId);
    if (swapper) {
      for (const p of room.players.filter(p => !p.eliminated && p.telegramId !== telegramId)) {
        try {
          await bot.api.sendMessage(
            Number(p.telegramId),
            tFor(p, "swap-perk-broadcast", { playerName: displayName(swapper) }),
            { parse_mode: "HTML" }
          );
        } catch { /* blocked */ }
      }
    }
    // Restart the AFK turn timer — fresh 2 min to make their guess
    setTimer(turnKey(roomId, room.turnNumber ?? 0), TURN_TIMEOUT_MS, () => {
      void handleTurnAFK(bot, roomId, telegramId, room.turnNumber ?? 0);
    });
  }
}

// ── Handler registration ──────────────────────────────────────────────────────

export function registerGameHandlers(bot: Bot<MyContext>): void {
  // ── Truth callback ───────────────────────────────────────────────────────
  bot.callbackQuery(/^truth:(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const telegramId = String(ctx.from.id);

    const pending = await getPendingGuess(roomId);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: ctx.t("session-expired"), show_alert: true });
      return;
    }
    if (pending.targetId !== telegramId) {
      await ctx.answerCallbackQuery({ text: ctx.t("not-your-turn"), show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    // Collapse the bluff-or-truth prompt in-place so the chat stays clean
    try {
      await ctx.editMessageText(ctx.t("you-chose-truth"), { parse_mode: "HTML" });
    } catch {
      try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }); } catch {}
    }

    const room = await getRoom(roomId);
    if (room) await processTruth(bot, roomId, pending, room);
  });

  // ── Bluff callback ───────────────────────────────────────────────────────
  bot.callbackQuery(/^bluff:(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const telegramId = String(ctx.from.id);

    const pending = await getPendingGuess(roomId);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: ctx.t("session-expired"), show_alert: true });
      return;
    }
    if (pending.targetId !== telegramId) {
      await ctx.answerCallbackQuery({ text: ctx.t("not-your-turn"), show_alert: true });
      return;
    }

    const room = await getRoom(roomId);
    if (!room) return;

    if (room.players.find(p => p.telegramId === telegramId)?.hasBluffed) {
      await ctx.answerCallbackQuery({ text: ctx.t("bluff-already-used"), show_alert: true });
      try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }); } catch {}
      await processTruth(bot, roomId, pending, room);
      return;
    }

    await ctx.answerCallbackQuery();
    // Replace the bluff-or-truth prompt with the fake-stats instructions in-place
    try {
      await ctx.editMessageText(ctx.t("enter-fake-stats"), { parse_mode: "HTML" });
    } catch {
      try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }); } catch {}
      await ctx.reply(ctx.t("enter-fake-stats"), { parse_mode: "HTML" });
    }

    await setAwaitingBluff(telegramId, roomId);

    // Restart timer for fake-stats input phase
    setTimer(bluffKey(roomId, room.turnNumber ?? 0), BLUFF_TIMEOUT_MS, () => {
      void handleBluffAFK(bot, roomId, telegramId, room.turnNumber ?? 0);
    });
  });

  // ── Claim swap perk callback ─────────────────────────────────────────────
  bot.callbackQuery(/^claim_swap:(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const telegramId = String(ctx.from.id);

    const room = await getRoom(roomId);
    if (!room || room.status !== "playing" || room.currentAttackerId !== telegramId) {
      await ctx.answerCallbackQuery({ text: ctx.t("session-expired"), show_alert: true });
      return;
    }
    if (!room.players.find(p => p.telegramId === telegramId)?.swapPerkAvailable) {
      await ctx.answerCallbackQuery({ text: ctx.t("session-expired"), show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }); } catch {}

    // Pause the turn AFK timer while player enters swap positions
    cancelTimer(turnKey(roomId, room.turnNumber ?? 0));
    await setAwaitingSwap(telegramId, roomId);
    await ctx.reply(ctx.t("swap-perk-ask-positions"), { parse_mode: "HTML" });
  });

  // ── All text messages ────────────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const telegramId = String(from.id);
    const text = ctx.message.text.trim();

    // 1. Awaiting fake bluff stats
    const bluffRoomId = await getAwaitingBluff(telegramId);
    if (bluffRoomId) {
      await handleFakeStatsInput(ctx, bot, telegramId, bluffRoomId, text);
      return;
    }

    // 2. Awaiting swap positions
    const swapRoomId = await getAwaitingSwap(telegramId);
    if (swapRoomId) {
      await handleSwapInput(ctx, bot, telegramId, swapRoomId, text);
      return;
    }

    // 3. Exactly 4 digits → code or guess
    if (!/^\d{4}$/.test(text)) return;

    const roomId = await getPlayerRoom(telegramId);
    if (!roomId) return;

    const room = await getRoom(roomId);
    if (!room) return;

    if (room.status === "collecting_codes") {
      await handleCodeCollection(ctx, bot, telegramId, roomId, text);
    } else if (room.status === "playing") {
      await handleGuess(ctx, bot, telegramId, roomId, text, room);
    }
  });
}

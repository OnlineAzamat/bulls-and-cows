import { Bot } from "grammy";
import { MyContext } from "../types";
import { i18n } from "../utils/i18n";
import {
  getPlayerRoom,
  getRoom,
  submitSecretCode,
  RoomData,
  RoomPlayer,
} from "../services/roomService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function tFor(player: RoomPlayer, key: string, vars?: Record<string, string>): string {
  return i18n.t(player.languageCode, key, vars);
}

function displayName(player: RoomPlayer): string {
  return player.username ? `@${player.username}` : player.firstName;
}

// Find the player in the room whose turn is next and their target.
function resolveCurrentTurn(room: RoomData): {
  attacker: RoomPlayer;
  target: RoomPlayer;
} | null {
  if (!room.turnOrder || !room.currentAttackerId) return null;

  const entry = room.turnOrder.find((e) => e.attackerId === room.currentAttackerId);
  if (!entry) return null;

  const attacker = room.players.find((p) => p.telegramId === entry.attackerId);
  const target = room.players.find((p) => p.telegramId === entry.targetId);
  if (!attacker || !target) return null;

  return { attacker, target };
}

// Broadcast "all codes collected" + prompt the first player for their guess.
async function broadcastGameStart(ctx: MyContext, room: RoomData): Promise<void> {
  // Tell everyone the game is beginning
  for (const player of room.players) {
    const msg = tFor(player, "all-codes-collected", { roomId: room.roomId });
    try {
      await ctx.api.sendMessage(Number(player.telegramId), msg, {
        parse_mode: "HTML",
      });
    } catch { /* blocked */ }
  }

  // Prompt only the first attacker
  const turn = resolveCurrentTurn(room);
  if (!turn) return;

  const { attacker, target } = turn;
  const msg = tFor(attacker, "your-turn", {
    targetName: displayName(target),
    roomId: room.roomId,
  });

  try {
    await ctx.api.sendMessage(Number(attacker.telegramId), msg, {
      parse_mode: "HTML",
    });
  } catch { /* blocked */ }
}

// ── Secret-code collection handler ───────────────────────────────────────────

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
    // WRONG_STATE / PLAYER_NOT_IN_ROOM are silent — the user may have sent a
    // 4-digit number for an unrelated reason outside of an active game.
    return;
  }

  await ctx.reply(ctx.t("code-accepted"));

  if (result.allCollected) {
    await broadcastGameStart(ctx, result.room);
  }
}

// ── Main registration ─────────────────────────────────────────────────────────

export function registerGameHandlers(bot: Bot<MyContext>): void {
  // This single hears() handler covers ALL 4-digit input across every game phase.
  // It routes to the correct sub-handler based on the current room status.
  bot.hears(/^\d{4}$/, async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const telegramId = String(from.id);
    const input = ctx.message!.text!;

    const roomId = await getPlayerRoom(telegramId);
    if (!roomId) return; // user is not in any active room — ignore silently

    const room = await getRoom(roomId);
    if (!room) return;

    if (room.status === "collecting_codes") {
      await handleCodeCollection(ctx, telegramId, roomId, input);
      return;
    }

    // Phase 5 will handle the "playing" state branch here.
    // For now, acknowledge that the game is in progress.
    if (room.status === "playing") {
      await ctx.reply(ctx.t("wait-your-turn"));
    }
  });
}

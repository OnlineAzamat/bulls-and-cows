import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types";
import { i18n } from "../utils/i18n";
import { getCachedLocale } from "../utils/localeCache";
import {
  createRoom,
  joinRoom,
  getRoom,
  setRoomStatus,
  RoomPlayer,
} from "../services/roomService";

// Reads the user's locale from Redis cache (set during language selection).
// Falls back to ctx.i18n.getLocale() only if the cache is cold (e.g. new user
// who hasn't chosen a language yet).
async function resolveLocale(ctx: MyContext): Promise<string> {
  const telegramId = String(ctx.from!.id);
  return (await getCachedLocale(telegramId)) ?? (await ctx.i18n.getLocale());
}

// Translate a message for a specific player using their stored languageCode.
// Used when sending outbound messages to users other than the current ctx.from.
function tFor(player: RoomPlayer, key: string, vars?: Record<string, string>): string {
  return i18n.t(player.languageCode, key, vars);
}

export function registerRoomHandlers(bot: Bot<MyContext>): void {
  // ── /createroom ──────────────────────────────────────────────────────────
  bot.command("createroom", async (ctx) => {
    const from = ctx.from!;
    const locale = await resolveLocale(ctx);

    const host: RoomPlayer = {
      telegramId: String(from.id),
      firstName: from.first_name,
      username: from.username,
      languageCode: locale,
    };

    const roomId = await createRoom(host);

    const keyboard = new InlineKeyboard().text(
      ctx.t("btn-start-game"),
      `start_game:${roomId}`
    );

    await ctx.reply(ctx.t("room-created", { roomId }), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // ── /joinroom <ROOMID> ────────────────────────────────────────────────────
  bot.command("joinroom", async (ctx) => {
    const roomId = ctx.match.trim().toUpperCase();

    if (!roomId) {
      await ctx.reply(ctx.t("joinroom-usage"), { parse_mode: "HTML" });
      return;
    }

    const from = ctx.from!;
    const locale = await resolveLocale(ctx);

    const player: RoomPlayer = {
      telegramId: String(from.id),
      firstName: from.first_name,
      username: from.username,
      languageCode: locale,
    };

    const result = await joinRoom(roomId, player);

    if (!result.success) {
      const keyMap: Record<typeof result.reason, string> = {
        ROOM_NOT_FOUND: "room-not-found",
        ROOM_NOT_WAITING: "room-not-waiting",
        ALREADY_IN_ROOM: "already-in-room",
      };
      await ctx.reply(ctx.t(keyMap[result.reason], { roomId }), {
        parse_mode: "HTML",
      });
      return;
    }

    const { room } = result;
    await ctx.reply(ctx.t("room-joined", { roomId }), { parse_mode: "HTML" });

    // Notify host (if they're a different person) using the host's own locale
    if (room.hostId !== String(from.id)) {
      const hostPlayer = room.players.find((p) => p.telegramId === room.hostId);
      const displayName = from.username ? `@${from.username}` : from.first_name;
      const hostMsg = hostPlayer
        ? tFor(hostPlayer, "player-joined", {
            name: displayName,
            count: String(room.players.length),
            roomId,
          })
        : "";

      if (hostMsg) {
        try {
          await ctx.api.sendMessage(Number(room.hostId), hostMsg, {
            parse_mode: "HTML",
          });
        } catch {
          // Host may have blocked the bot; continue silently
        }
      }
    }
  });

  // ── start_game:{roomId} callback ──────────────────────────────────────────
  bot.callbackQuery(/^start_game:(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const from = ctx.from;

    const room = await getRoom(roomId);

    if (!room) {
      await ctx.answerCallbackQuery({
        text: ctx.t("room-not-found", { roomId }),
        show_alert: true,
      });
      return;
    }

    if (room.hostId !== String(from.id)) {
      await ctx.answerCallbackQuery({
        text: ctx.t("not-host"),
        show_alert: true,
      });
      return;
    }

    if (room.status !== "waiting") {
      await ctx.answerCallbackQuery({
        text: ctx.t("room-status-playing"),
        show_alert: true,
      });
      return;
    }

    if (room.players.length < 2) {
      await ctx.answerCallbackQuery({
        text: ctx.t("not-enough-players"),
        show_alert: true,
      });
      return;
    }

    await setRoomStatus(roomId, "collecting_codes");

    // Remove the Start Game button from the original message
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    } catch {
      // Message may already be edited; ignore
    }

    await ctx.answerCallbackQuery();

    // Tell every player to send their secret code — each in their own locale
    for (const player of room.players) {
      const msg = tFor(player, "game-collecting-codes", {
        roomId,
        count: String(room.players.length),
      });
      try {
        await ctx.api.sendMessage(Number(player.telegramId), msg, {
          parse_mode: "HTML",
        });
      } catch {
        // Player blocked the bot; skip
      }
    }
  });
}

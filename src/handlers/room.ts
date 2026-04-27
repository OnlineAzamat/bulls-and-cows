import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types";
import { i18n } from "../utils/i18n";
import { getCachedLocale } from "../utils/localeCache";
import {
  createRoom,
  joinRoom,
  getRoom,
  getPlayerRoom,
  clearPlayerRoom,
  setRoomStatus,
  setLobbyMessage,
  getPlayerLobbyMessages,
  deleteLobbyMessage,
  removePlayer,
  RoomPlayer,
  RoomData,
} from "../services/roomService";

async function resolveLocale(ctx: MyContext): Promise<string> {
  const telegramId = String(ctx.from!.id);
  return (await getCachedLocale(telegramId)) ?? (await ctx.i18n.getLocale());
}

function tFor(player: RoomPlayer, key: string, vars?: Record<string, string>): string {
  return i18n.t(player.languageCode, key, vars);
}

function buildPlayerList(
  players: RoomPlayer[],
  hostId: string,
  locale: string
): string {
  return players
    .map((p) => {
      const name = p.username ? `@${p.username}` : p.firstName;
      const label = p.telegramId === hostId ? ` ${i18n.t(locale, "label-host")}` : "";
      return `• ${name}${label}`;
    })
    .join("\n");
}

// Host gets kick buttons + start game; others get a leave button.
function buildLobbyKeyboard(
  room: RoomData,
  viewerTelegramId: string,
  locale: string
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (viewerTelegramId === room.hostId) {
    for (const p of room.players) {
      if (p.telegramId === room.hostId) continue;
      const name = p.username ? `@${p.username}` : p.firstName;
      kb.text(`✖ ${name}`, `kick:${room.roomId}:${p.telegramId}`).row();
    }
    kb.text(i18n.t(locale, "btn-start-game"), `start_game:${room.roomId}`);
  } else {
    kb.text(i18n.t(locale, "btn-leave-room"), `leave:${room.roomId}`);
  }
  return kb;
}

// Edit every player's stored lobby message with the current player list.
async function updateAllLobbyMessages(
  ctx: MyContext,
  room: RoomData,
  skipTelegramId?: string
): Promise<void> {
  const msgMap = await getPlayerLobbyMessages(room.roomId, room.players);

  for (const player of room.players) {
    if (player.telegramId === skipTelegramId) continue;
    const msgId = msgMap[player.telegramId];
    if (!msgId) continue;

    const playerList = buildPlayerList(room.players, room.hostId, player.languageCode);
    const keyboard = buildLobbyKeyboard(room, player.telegramId, player.languageCode);

    try {
      await ctx.api.editMessageText(
        Number(player.telegramId),
        msgId,
        tFor(player, "room-lobby", {
          roomId: room.roomId,
          count: String(room.players.length),
          playerList,
        }),
        { parse_mode: "HTML", reply_markup: keyboard }
      );
    } catch { /* message gone or content unchanged */ }
  }
}

// Shared leave/kick logic split into its own helper so both the command
// and the inline button share the same flow.
async function doLeaveOrKick(
  ctx: MyContext,
  leaverId: string,
  roomId: string,
  isCallback: boolean
): Promise<void> {
  const room = await getRoom(roomId);

  if (!room) {
    const reply = ctx.t("leaveroom-not-in-room");
    if (isCallback) {
      await ctx.answerCallbackQuery({ text: reply, show_alert: true });
    } else {
      await ctx.reply(reply);
    }
    return;
  }

  if (room.status !== "waiting") {
    const reply = ctx.t("leaveroom-game-active");
    if (isCallback) {
      await ctx.answerCallbackQuery({ text: reply, show_alert: true });
    } else {
      await ctx.reply(reply);
    }
    return;
  }

  if (isCallback) await ctx.answerCallbackQuery();

  const result = await removePlayer(roomId, leaverId);

  if (result.type === "error") return;

  if (result.type === "dissolved") {
    // Host left — notify everyone and clean up side-keys
    await clearPlayerRoom(leaverId);
    for (const p of result.players) {
      await clearPlayerRoom(p.telegramId);
      const msgMap = await getPlayerLobbyMessages(roomId, result.players);
      const msgId = msgMap[p.telegramId];
      const text = tFor(p, "room-dissolved", { roomId });
      if (msgId) {
        try {
          await ctx.api.editMessageText(Number(p.telegramId), msgId, text, {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard(),
          });
          await deleteLobbyMessage(roomId, p.telegramId);
          continue;
        } catch { /* fall through to sendMessage */ }
      }
      try {
        await ctx.api.sendMessage(Number(p.telegramId), text, { parse_mode: "HTML" });
      } catch { /* blocked */ }
      await deleteLobbyMessage(roomId, p.telegramId);
    }
    return;
  }

  // Non-host left — update their message, clear their keys, refresh others
  const { room: updatedRoom } = result;
  await clearPlayerRoom(leaverId);

  const leaver = room.players.find((p) => p.telegramId === leaverId);
  if (leaver) {
    const msgMap = await getPlayerLobbyMessages(roomId, room.players);
    const leaverMsgId = msgMap[leaverId];
    const leftText = tFor(leaver, "you-left-room", { roomId });
    if (leaverMsgId) {
      try {
        await ctx.api.editMessageText(Number(leaverId), leaverMsgId, leftText, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard(),
        });
      } catch {
        try {
          await ctx.api.sendMessage(Number(leaverId), leftText, { parse_mode: "HTML" });
        } catch { /* blocked */ }
      }
      await deleteLobbyMessage(roomId, leaverId);
    } else {
      await ctx.reply(leftText, { parse_mode: "HTML" });
    }
  }

  await updateAllLobbyMessages(ctx, updatedRoom, leaverId);
}

export function registerRoomHandlers(bot: Bot<MyContext>): void {
  // ── /createroom ──────────────────────────────────────────────────────────
  bot.command("createroom", async (ctx) => {
    const from = ctx.from!;
    const telegramId = String(from.id);

    // User-room lock: block if already in an active room
    const existingRoomId = await getPlayerRoom(telegramId);
    if (existingRoomId) {
      const existingRoom = await getRoom(existingRoomId);
      const isActiveRoom =
        existingRoom &&
        existingRoom.status !== "finished" &&
        existingRoom.players.some(p => p.telegramId === telegramId);
      if (isActiveRoom) {
        await ctx.reply(ctx.t("already-in-active-room"), { parse_mode: "HTML" });
        return;
      }
      // Stale, finished, or orphaned pointer — clean up silently
      await clearPlayerRoom(telegramId);
    }

    const locale = await resolveLocale(ctx);

    const host: RoomPlayer = {
      telegramId,
      firstName: from.first_name,
      username: from.username,
      languageCode: locale,
    };

    const roomId = await createRoom(host);

    const fakeRoom: RoomData = {
      roomId,
      hostId: host.telegramId,
      status: "waiting",
      players: [host],
      createdAt: Date.now(),
    };

    const playerList = buildPlayerList([host], host.telegramId, locale);
    const keyboard = buildLobbyKeyboard(fakeRoom, host.telegramId, locale);

    const sentMsg = await ctx.reply(
      ctx.t("room-lobby", { roomId, count: "1", playerList }),
      { parse_mode: "HTML", reply_markup: keyboard }
    );

    await setLobbyMessage(roomId, host.telegramId, sentMsg.message_id);
  });

  // ── /joinroom <ROOMID> ────────────────────────────────────────────────────
  bot.command("joinroom", async (ctx) => {
    const roomId = ctx.match.trim().toUpperCase();

    if (!roomId) {
      await ctx.reply(ctx.t("joinroom-usage"), { parse_mode: "HTML" });
      return;
    }

    const from = ctx.from!;
    const telegramId = String(from.id);

    // User-room lock: block if already in a DIFFERENT active room
    const existingRoomId = await getPlayerRoom(telegramId);
    if (existingRoomId && existingRoomId !== roomId) {
      const existingRoom = await getRoom(existingRoomId);
      const isActiveRoom =
        existingRoom &&
        existingRoom.status !== "finished" &&
        existingRoom.players.some(p => p.telegramId === telegramId);
      if (isActiveRoom) {
        await ctx.reply(ctx.t("already-in-active-room"), { parse_mode: "HTML" });
        return;
      }
      // Stale, finished, or orphaned pointer — clean up silently
      await clearPlayerRoom(telegramId);
    }

    const locale = await resolveLocale(ctx);

    const player: RoomPlayer = {
      telegramId,
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
      await ctx.reply(ctx.t(keyMap[result.reason], { roomId }), { parse_mode: "HTML" });
      return;
    }

    const { room } = result;

    // Send the joining player their own lobby message (with leave button)
    const playerList = buildPlayerList(room.players, room.hostId, locale);
    const keyboard = buildLobbyKeyboard(room, player.telegramId, locale);
    const sentMsg = await ctx.reply(
      ctx.t("room-lobby", {
        roomId,
        count: String(room.players.length),
        playerList,
      }),
      { parse_mode: "HTML", reply_markup: keyboard }
    );
    await setLobbyMessage(roomId, player.telegramId, sentMsg.message_id);

    // Edit all existing players' lobby messages to reflect the new arrival
    await updateAllLobbyMessages(ctx, room, player.telegramId);
  });

  // ── /leaveroom ────────────────────────────────────────────────────────────
  bot.command("leaveroom", async (ctx) => {
    const from = ctx.from!;
    const telegramId = String(from.id);

    const roomId = await getPlayerRoom(telegramId);

    if (!roomId) {
      await ctx.reply(ctx.t("leaveroom-not-in-room"));
      return;
    }

    await doLeaveOrKick(ctx, telegramId, roomId, false);
  });

  // ── leave:{roomId} callback (Leave Room button for non-host players) ──────
  bot.callbackQuery(/^leave:(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const telegramId = String(ctx.from.id);
    await doLeaveOrKick(ctx, telegramId, roomId, true);
  });

  // ── kick:{roomId}:{telegramId} callback ───────────────────────────────────
  bot.callbackQuery(/^kick:([^:]+):(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const targetId = ctx.match[2];
    const requesterId = String(ctx.from.id);

    const room = await getRoom(roomId);

    if (!room) {
      await ctx.answerCallbackQuery({ text: ctx.t("room-not-found", { roomId }), show_alert: true });
      return;
    }
    if (room.hostId !== requesterId) {
      await ctx.answerCallbackQuery({ text: ctx.t("not-host"), show_alert: true });
      return;
    }
    if (room.status !== "waiting") {
      await ctx.answerCallbackQuery({ text: ctx.t("room-status-playing"), show_alert: true });
      return;
    }

    const kickedPlayer = room.players.find((p) => p.telegramId === targetId);
    if (!kickedPlayer) {
      await ctx.answerCallbackQuery();
      return;
    }

    const result = await removePlayer(roomId, targetId);
    await ctx.answerCallbackQuery();

    if (result.type === "error") return;

    // Notify the kicked player
    const msgMap = await getPlayerLobbyMessages(roomId, room.players);
    const kickedMsgId = msgMap[targetId];
    const kickedText = tFor(kickedPlayer, "you-were-kicked", { roomId });

    if (kickedMsgId) {
      try {
        await ctx.api.editMessageText(
          Number(targetId),
          kickedMsgId,
          kickedText,
          { parse_mode: "HTML", reply_markup: new InlineKeyboard() }
        );
      } catch {
        try {
          await ctx.api.sendMessage(Number(targetId), kickedText, { parse_mode: "HTML" });
        } catch { /* blocked */ }
      }
      await deleteLobbyMessage(roomId, targetId);
    } else {
      try {
        await ctx.api.sendMessage(Number(targetId), kickedText, { parse_mode: "HTML" });
      } catch { /* blocked */ }
    }

    await clearPlayerRoom(targetId);

    if (result.type === "removed") {
      await updateAllLobbyMessages(ctx, result.room, targetId);
    }
  });

  // ── /closeroom ────────────────────────────────────────────────────────────
  bot.command("closeroom", async (ctx) => {
    const from = ctx.from!;
    const telegramId = String(from.id);

    const roomId = await getPlayerRoom(telegramId);
    if (!roomId) {
      await ctx.reply(ctx.t("leaveroom-not-in-room"));
      return;
    }

    const room = await getRoom(roomId);
    if (!room) {
      await clearPlayerRoom(telegramId);
      await ctx.reply(ctx.t("leaveroom-not-in-room"));
      return;
    }

    if (room.hostId !== telegramId) {
      await ctx.reply(ctx.t("closeroom-not-host"));
      return;
    }

    if (room.status !== "waiting") {
      await ctx.reply(ctx.t("leaveroom-game-active"));
      return;
    }

    // removePlayer on the host atomically deletes the room key
    const result = await removePlayer(roomId, telegramId);
    if (result.type !== "dissolved") return;

    const msgMap = await getPlayerLobbyMessages(roomId, result.players);

    for (const p of result.players) {
      await clearPlayerRoom(p.telegramId);

      const isHost = p.telegramId === telegramId;
      const text = isHost
        ? tFor(p, "closeroom-success", { roomId })
        : tFor(p, "room-closed-by-host", { roomId });

      const msgId = msgMap[p.telegramId];
      if (msgId) {
        try {
          await ctx.api.editMessageText(Number(p.telegramId), msgId, text, {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard(),
          });
          await deleteLobbyMessage(roomId, p.telegramId);
          continue;
        } catch { /* fall through */ }
      }

      await deleteLobbyMessage(roomId, p.telegramId);

      if (isHost) {
        try { await ctx.reply(text, { parse_mode: "HTML" }); } catch { }
      } else {
        try {
          await ctx.api.sendMessage(Number(p.telegramId), text, { parse_mode: "HTML" });
        } catch { /* blocked */ }
      }
    }
  });

  // ── start_game:{roomId} callback ──────────────────────────────────────────
  bot.callbackQuery(/^start_game:(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const from = ctx.from;

    const room = await getRoom(roomId);

    if (!room) {
      await ctx.answerCallbackQuery({ text: ctx.t("room-not-found", { roomId }), show_alert: true });
      return;
    }
    if (room.hostId !== String(from.id)) {
      await ctx.answerCallbackQuery({ text: ctx.t("not-host"), show_alert: true });
      return;
    }
    if (room.status !== "waiting") {
      await ctx.answerCallbackQuery({ text: ctx.t("room-status-playing"), show_alert: true });
      return;
    }
    if (room.players.length < 2) {
      await ctx.answerCallbackQuery({ text: ctx.t("not-enough-players"), show_alert: true });
      return;
    }

    await setRoomStatus(roomId, "collecting_codes");

    // Remove all inline buttons from every player's lobby message
    const msgMap = await getPlayerLobbyMessages(roomId, room.players);
    for (const player of room.players) {
      const msgId = msgMap[player.telegramId];
      if (!msgId) continue;
      try {
        await ctx.api.editMessageReplyMarkup(Number(player.telegramId), msgId, {
          reply_markup: new InlineKeyboard(),
        });
      } catch { /* already edited */ }
    }

    await ctx.answerCallbackQuery();

    for (const player of room.players) {
      try {
        await ctx.api.sendMessage(
          Number(player.telegramId),
          tFor(player, "game-collecting-codes", {
            roomId,
            count: String(room.players.length),
          }),
          { parse_mode: "HTML" }
        );
      } catch { /* blocked */ }
    }
  });
}

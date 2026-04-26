import { Bot } from "grammy";
import { MyContext } from "../types";
import { prisma } from "../db/prisma";

const MEDALS = ["🥇", "🥈", "🥉"];

export function registerTopHandler(bot: Bot<MyContext>): void {
  bot.command("top", async (ctx) => {
    const users = await prisma.user.findMany({
      orderBy: [{ wins: "desc" }, { gamesPlayed: "desc" }],
      take: 10,
    });

    if (users.length === 0) {
      await ctx.reply(ctx.t("top-empty"));
      return;
    }

    const lines = users.map((u, idx) => {
      const rank = MEDALS[idx] ?? `${idx + 1}.`;
      const name = u.username ? `@${u.username}` : u.firstName;
      return `${rank} <b>${name}</b> — ${u.wins} ${ctx.t("top-label-wins")} (${u.gamesPlayed} ${ctx.t("top-label-games")})`;
    });

    await ctx.reply(
      `${ctx.t("top-title")}\n\n${lines.join("\n")}`,
      { parse_mode: "HTML" }
    );
  });
}

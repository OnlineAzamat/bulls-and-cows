import { Bot } from "grammy";
import { MyContext } from "../types";
import { getUserProfile } from "../services/userService";

export function registerProfileHandler(bot: Bot<MyContext>): void {
  bot.command("profile", async (ctx) => {
    const telegramId = BigInt(ctx.from!.id);
    const user = await getUserProfile(telegramId);

    if (!user) {
      await ctx.reply(ctx.t("profile-not-found"));
      return;
    }

    await ctx.reply(
      ctx.t("profile", {
        name: user.firstName,
        games: String(user.gamesPlayed),
        wins: String(user.wins),
      }),
      { parse_mode: "HTML" }
    );
  });
}

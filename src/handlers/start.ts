import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types";
import { upsertUser } from "../services/userService";
import { setCachedLocale } from "../utils/localeCache";

export function registerStartHandler(bot: Bot<MyContext>): void {
  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text(ctx.t("btn-language-ru"), "set_lang:ru")
      .text(ctx.t("btn-language-uz"), "set_lang:uz");

    await ctx.reply(ctx.t("choose-language"), { reply_markup: keyboard });
  });

  bot.callbackQuery(/^set_lang:(.+)$/, async (ctx) => {
    const locale = ctx.match[1];
    const from = ctx.from;

    await upsertUser({
      telegramId: BigInt(from.id),
      username: from.username,
      firstName: from.first_name,
      languageCode: locale,
    });

    // Warm the Redis locale cache so localeMiddleware returns it immediately.
    // This also survives server restarts without a DB round-trip.
    await setCachedLocale(String(from.id), locale);
    await ctx.i18n.setLocale(locale);

    await ctx.editMessageText(ctx.t("welcome"), { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
  });
}

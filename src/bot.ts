import "dotenv/config";
import { Bot, session } from "grammy";
import { MyContext, SessionData } from "./types";
import { i18n } from "./utils/i18n";
import { localeMiddleware } from "./middleware/locale";
import { registerStartHandler } from "./handlers/start";
import { registerProfileHandler } from "./handlers/profile";
import { registerRoomHandlers } from "./handlers/room";
import { registerGameHandlers } from "./handlers/game";
import { registerTopHandler } from "./handlers/top";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not set in .env");

const bot = new Bot<MyContext>(BOT_TOKEN);

bot.use(
  session<SessionData, MyContext>({
    initial: (): SessionData => ({}),
  })
);

bot.use(i18n);
bot.use(localeMiddleware); // restores locale from DB/Redis after restarts

registerStartHandler(bot);
registerProfileHandler(bot);
registerRoomHandlers(bot);
registerTopHandler(bot);
registerGameHandlers(bot);

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
});

bot.start({
  onStart: (info) => console.log(`Bot @${info.username} is running`),
});

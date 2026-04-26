import type { MiddlewareFn } from "grammy";
import type { MyContext } from "../types";
import { getCachedLocale, setCachedLocale } from "../utils/localeCache";
import { prisma } from "../db/prisma";

/**
 * Restores the user's preferred language on every update.
 *
 * Bug fixed: the original version used ctx.i18n.useLocale() which only updates
 * the translate function for the current update but does NOT write to
 * session.__language_code. As a result ctx.i18n.getLocale() — which reads from
 * session.__language_code — kept returning Telegram's system language ('ru'),
 * and that wrong value was persisted into RoomPlayer.languageCode in Redis,
 * causing all broadcast messages to render in Russian.
 *
 * Fix: use await ctx.i18n.setLocale() which writes the value into
 * session.__language_code so getLocale() returns the correct locale for the
 * rest of the middleware chain and all handlers.
 *
 * Priority: Redis cache (15 min TTL) → PostgreSQL → grammY default
 */
export const localeMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (!ctx.from) return next();

  const telegramId = String(ctx.from.id);

  // 1. Fast path: Redis cache
  const cached = await getCachedLocale(telegramId);
  if (cached) {
    await ctx.i18n.setLocale(cached);
    return next();
  }

  // 2. Slow path: PostgreSQL
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { languageCode: true },
  });

  if (user) {
    await setCachedLocale(telegramId, user.languageCode);
    await ctx.i18n.setLocale(user.languageCode);
  }

  return next();
};

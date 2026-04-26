import { redis } from "../db/redis";

const LOCALE_CACHE_TTL = 900; // 15 minutes

function cacheKey(telegramId: string): string {
  return `locale:${telegramId}`;
}

export async function getCachedLocale(telegramId: string): Promise<string | null> {
  return redis.get(cacheKey(telegramId));
}

export async function setCachedLocale(
  telegramId: string,
  locale: string
): Promise<void> {
  await redis.set(cacheKey(telegramId), locale, "EX", LOCALE_CACHE_TTL);
}

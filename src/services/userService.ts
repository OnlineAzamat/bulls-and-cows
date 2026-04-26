import { prisma } from "../db/prisma";

interface UpsertUserInput {
  telegramId: bigint;
  username?: string;
  firstName: string;
  languageCode: string;
}

export async function upsertUser(input: UpsertUserInput) {
  return prisma.user.upsert({
    where: { telegramId: input.telegramId },
    update: {
      username: input.username ?? null,
      firstName: input.firstName,
      languageCode: input.languageCode,
    },
    create: {
      telegramId: input.telegramId,
      username: input.username ?? null,
      firstName: input.firstName,
      languageCode: input.languageCode,
    },
  });
}

export async function updateUserLanguage(
  telegramId: bigint,
  languageCode: string
) {
  return prisma.user.update({
    where: { telegramId },
    data: { languageCode },
  });
}

export async function getUserProfile(telegramId: bigint) {
  return prisma.user.findUnique({ where: { telegramId } });
}

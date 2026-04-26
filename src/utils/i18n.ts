import { I18n } from "@grammyjs/i18n";
import path from "path";
import { MyContext } from "../types";

export const i18n = new I18n<MyContext>({
  defaultLocale: "ru",
  useSession: true,
  directory: path.resolve(__dirname, "../locales"),
});

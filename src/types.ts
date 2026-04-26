import { Context, SessionFlavor } from "grammy";
import { I18nFlavor } from "@grammyjs/i18n";

export interface SessionData {
  __language_code?: string;
}

export type MyContext = Context & SessionFlavor<SessionData> & I18nFlavor;

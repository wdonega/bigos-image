import type { Locale } from "../config.ts";
import { type Messages, en } from "./en.ts";
import { ptBR } from "./pt-BR.ts";

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = { en, "pt-BR": ptBR };

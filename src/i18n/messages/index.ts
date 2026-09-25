import type { Locale } from "../config.ts";
import { type Messages, enUS } from "./en-US.ts";
import { esMX } from "./es-MX.ts";
import { ptBR } from "./pt-BR.ts";
import { zhCN } from "./zh-CN.ts";

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = { "pt-BR": ptBR, "en-US": enUS, "es-MX": esMX, "zh-CN": zhCN };

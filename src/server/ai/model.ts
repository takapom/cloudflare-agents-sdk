import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "@/server/env";

const SUPPORT_DESK_MODEL = "@cf/moonshotai/kimi-k2.6";

export function getSupportDeskModel(env: Env): LanguageModel {
  return createWorkersAI({ binding: env.AI })(SUPPORT_DESK_MODEL);
}

import { Think, type MessageConcurrency } from "@cloudflare/think";
import type { LanguageModel } from "ai";
import { getSupportDeskModel } from "@/server/ai/model";
import type { Env } from "@/server/env";
import { replyDraftSystemPrompt } from "@/server/contexts/supportDesk/ai/shared/prompts";

export class ReplyDraftAgent extends Think<Env> {
  override maxSteps = 4;
  override sendReasoning = false;
  override messageConcurrency: MessageConcurrency = "queue";

  getModel(): LanguageModel {
    return getSupportDeskModel(this.env);
  }

  getSystemPrompt(): string {
    return replyDraftSystemPrompt();
  }
}

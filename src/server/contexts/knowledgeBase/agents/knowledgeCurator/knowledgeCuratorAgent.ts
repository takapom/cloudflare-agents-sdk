import {
  Think,
  type MessageConcurrency,
  type ToolCallContext,
  type ToolCallDecision,
  type TurnContext
} from "@cloudflare/think";
import type { LanguageModel, ToolSet } from "ai";
import { getSupportDeskModel } from "@/server/ai/model";
import type { Env } from "@/server/platform/env";
import { createKnowledgeBaseContext } from "@/server/contexts/knowledgeBase/knowledgeBaseContext";
import { knowledgeCuratorSystemPrompt } from "@/server/contexts/knowledgeBase/agents/knowledgeCurator/prompts";
import {
  isKnowledgeCuratorMutatingTool,
  readonlyKnowledgeCuratorToolNames
} from "@/server/contexts/knowledgeBase/agents/knowledgeCurator/toolPolicy";
import { createKnowledgeCuratorTools } from "@/server/contexts/knowledgeBase/agents/knowledgeCurator/tools";

export type KnowledgeCuratorState = {
  mode: "normal" | "readonly";
};

export class KnowledgeCuratorAgent extends Think<Env, KnowledgeCuratorState> {
  initialState: KnowledgeCuratorState = {
    mode: "normal"
  };

  override maxSteps = 6;
  override sendReasoning = false;
  override messageConcurrency: MessageConcurrency = "queue";

  getModel(): LanguageModel {
    return getSupportDeskModel(this.env);
  }

  getSystemPrompt(): string {
    return knowledgeCuratorSystemPrompt();
  }

  getTools(): ToolSet {
    return createKnowledgeCuratorTools(this.getKnowledgeBase().articles);
  }

  beforeTurn(ctx: TurnContext) {
    if (this.state.mode === "readonly") {
      return {
        system: `${ctx.system}\n\nCurrent mode: readonly`,
        activeTools: readonlyKnowledgeCuratorToolNames
      };
    }

    return {
      system: `${ctx.system}\n\nCurrent mode: normal`
    };
  }

  beforeToolCall(ctx: ToolCallContext): ToolCallDecision | void {
    if (
      this.state.mode === "readonly" &&
      isKnowledgeCuratorMutatingTool(ctx.toolName)
    ) {
      return {
        action: "block",
        reason: "readonly modeのため、変更系ツールは実行できません。"
      };
    }
  }

  private getKnowledgeBase() {
    return createKnowledgeBaseContext();
  }
}

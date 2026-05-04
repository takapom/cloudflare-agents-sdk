import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import type { ToolSet } from "ai";
import type { Env } from "@/server/platform/env";

export function createCodemodeTool(env: Env, readOnlyTools: ToolSet) {
  const executor = new DynamicWorkerExecutor({
    loader: env.LOADER,
    timeout: 15_000,
    globalOutbound: null
  });

  return createCodeTool({
    tools: readOnlyTools,
    executor,
    description: `
Run JavaScript code in an isolated Dynamic Worker sandbox to orchestrate read-only tools exposed by WorkspaceAgent.

Use this when you need loops, branching, sorting, grouping, joining, or multi-step analysis across many read-only results.
The sandbox has no outbound network access. For weather, call codemode.getWeather instead of fetch().
It can only call the read-only codemode.* API below.
Do not use this for mutations such as adding notes, changing ticket status, sending messages, or seeding data.

{{types}}
`.trim()
  });
}

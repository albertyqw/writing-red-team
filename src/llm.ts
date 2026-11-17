import Anthropic from "@anthropic-ai/sdk";
import type { Llm } from "./types.js";

/**
 * Real model client. Structured output comes from forcing a single tool call,
 * so every pass returns JSON that matches its schema.
 */
export function anthropicLlm(apiKey = process.env.ANTHROPIC_API_KEY): Llm {
  if (!apiKey) {
    throw new Error("Set ANTHROPIC_API_KEY before running a pass.");
  }
  const client = new Anthropic({ apiKey });

  return async (call) => {
    const res = await client.messages.create({
      model: call.model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: "user", content: call.user }],
      tools: [
        {
          name: call.toolName,
          description: call.toolDescription,
          input_schema: { type: "object", ...call.jsonSchema },
        },
      ],
      tool_choice: { type: "tool", name: call.toolName },
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error(`Model returned no ${call.toolName} call.`);
    }
    return {
      data: block.input,
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
    };
  };
}

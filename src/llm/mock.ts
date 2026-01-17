import { LLMClient, LLMGenerationOptions, LLMMessage, LLMResponse } from "./base";
import { ModelConfig } from "../config/schema";

function rudimentaryTranslate(text: string) {
  return text
    .replace(/。/g, ".")
    .replace(/、/g, ",")
    .replace(/！/g, "!")
    .replace(/？/g, "?")
    .trim()
    .replace(/\s+/g, " ");
}

export class MockLLMClient implements LLMClient {
  constructor(public readonly model: ModelConfig) {}

  async generate(messages: LLMMessage[], _options?: LLMGenerationOptions): Promise<LLMResponse> {
    const lastUser = [...messages].reverse().find((msg) => msg.role === "user");
    const output = lastUser ? rudimentaryTranslate(lastUser.content) : "";
    return {
      output,
      usage: {
        promptTokens: 0,
        completionTokens: output.length / 4,
        totalTokens: output.length / 4,
      },
    };
  }
}

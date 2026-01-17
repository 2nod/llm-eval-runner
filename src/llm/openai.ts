import { LLMClient, LLMGenerationOptions, LLMMessage, LLMResponse, LLMError } from "./base";
import { ModelConfig } from "../config/schema";
import { DiskCache } from "./cache";
import { RateLimiter } from "./rateLimiter";

export interface OpenAIClientOptions {
  apiKey?: string;
  cache?: DiskCache<LLMResponse>;
  rateLimiter?: RateLimiter;
}

export class OpenAIChatClient implements LLMClient {
  private readonly apiKey: string;

  constructor(
    public readonly model: ModelConfig,
    private readonly options: OpenAIClientOptions
  ) {
    const envKey = process.env.OPENAI_API_KEY;
    if (!options.apiKey && !envKey) {
      throw new Error("OPENAI_API_KEY required for OpenAI provider");
    }
    this.apiKey = options.apiKey ?? envKey!;
  }

  async generate(messages: LLMMessage[], options?: LLMGenerationOptions): Promise<LLMResponse> {
    const payload = {
      model: this.model.name,
      temperature: options?.temperature ?? this.model.temperature ?? 0,
      top_p: this.model.topP,
      max_tokens: options?.maxOutputTokens ?? this.model.maxOutputTokens,
      response_format: this.model.jsonMode || options?.responseFormat === "json"
        ? { type: "json_object" }
        : undefined,
      messages: messages.map((msg) => ({ role: msg.role, content: msg.content })),
    };

    const exec = async () => {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new LLMError(`OpenAI request failed: ${response.status} ${body}`);
      }
      const data = await response.json();
      const choice = data.choices?.[0];
      const usage = data.usage;
      return {
        output: choice?.message?.content ?? "",
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : undefined,
        raw: data,
      } satisfies LLMResponse;
    };

    const cached = await this.options.cache?.get([payload, this.model.provider]);
    if (cached) {
      return cached;
    }

    const limiter = this.options.rateLimiter;
    const result = limiter
      ? await limiter.schedule(payload.max_tokens ?? 512, () => exec())
      : await exec();

    if (this.options.cache) {
      await this.options.cache.set([payload, this.model.provider], result);
    }
    return result;
  }
}

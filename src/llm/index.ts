import path from "path";
import fs from "fs";
import { ModelConfig } from "../config/schema";
import { DiskCache } from "./cache";
import { LLMClient, LLMResponse } from "./base";
import { MockLLMClient } from "./mock";
import { OpenAIChatClient } from "./openai";
import { RateLimiter, RateLimiterOptions } from "./rateLimiter";

export interface LLMFactoryOptions {
  cacheDir: string;
  rateLimiter?: RateLimiterOptions;
}

export function createLLMClient(model: ModelConfig, options: LLMFactoryOptions): LLMClient {
  fs.mkdirSync(options.cacheDir, { recursive: true });
  const cache = new DiskCache<LLMResponse>(
    path.join(options.cacheDir, model.name.replace(/\W+/g, "_"))
  );
  const limiter = options.rateLimiter
    ? new RateLimiter(options.rateLimiter)
    : undefined;
  if (model.provider === "mock") {
    return new MockLLMClient(model);
  }
  if (model.provider === "openai") {
    return new OpenAIChatClient(model, { cache, rateLimiter: limiter });
  }
  throw new Error(`Unsupported provider: ${model.provider}`);
}

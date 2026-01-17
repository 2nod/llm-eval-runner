import { ModelConfig } from "../config/schema";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: MessageRole;
  content: string;
}

export interface LLMGenerationOptions {
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "json" | "text";
  metadata?: Record<string, unknown>;
}

export interface LLMResponse {
  output: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

export interface LLMClient {
  readonly model: ModelConfig;
  generate(messages: LLMMessage[], options?: LLMGenerationOptions): Promise<LLMResponse>;
}

export class LLMError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

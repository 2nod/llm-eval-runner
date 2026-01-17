import { DatasetSample, Constraints, TranslationState } from "../types";
import { LLMClient } from "../llm/base";
import { ResolvedPrompt } from "../config/schema";
import { renderTemplate } from "../utils/template";

export interface TranslationResult {
  draft: string;
  usageTokens?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

function constraintsToMarkdown(constraints: Constraints) {
  const lines = [`targetLang: ${constraints.targetLang}`];
  if (constraints.tone) lines.push(`tone: ${constraints.tone}`);
  if (constraints.register) lines.push(`register: ${constraints.register}`);
  if (constraints.readingLevel) lines.push(`readingLevel: ${constraints.readingLevel}`);
  if (constraints.format.keepLineBreaks) lines.push("keepLineBreaks: true");
  if (constraints.format.maxChars) lines.push(`maxChars: ${constraints.format.maxChars}`);
  if (constraints.glossary.length) {
    lines.push("glossary:");
    for (const entry of constraints.glossary) {
      lines.push(`- ${entry.ja} => ${entry.en}${entry.strict ? " (strict)" : ""}`);
    }
  }
  if (constraints.bannedPatterns.length) {
    lines.push("bannedPatterns:");
    for (const entry of constraints.bannedPatterns) {
      lines.push(`- ${entry}`);
    }
  }
  return lines.join("\n");
}

function stateToMarkdown(state?: TranslationState) {
  if (!state) return "not provided";
  return JSON.stringify(state, null, 2);
}

export const DEFAULT_TRANSLATOR_TEMPLATE = `You translate Japanese to natural English that follows every constraint.
Return only the translation text.
# Source (Japanese)
{{text}}
# Context
{{context}}
# State
{{state}}
# Constraints
{{constraints}}
`;

export class Translator {
  constructor(
    private readonly llm: LLMClient,
    private readonly prompt: ResolvedPrompt | undefined
  ) {}

  async translate(sample: DatasetSample, constraints: Constraints, state?: TranslationState): Promise<TranslationResult> {
    const template = this.prompt?.template ?? DEFAULT_TRANSLATOR_TEMPLATE;
    const user = renderTemplate(template, {
      text: sample.ja.text,
      context: sample.ja.context ?? "(none)",
      state: stateToMarkdown(state),
      constraints: constraintsToMarkdown(constraints),
    });
    const systemMessage = this.prompt?.system ?? "You are a professional JA-EN literary translator.";
    const response = await this.llm.generate([
      { role: "system", content: systemMessage },
      { role: "user", content: user },
    ]);
    return {
      draft: response.output.trim(),
      usageTokens: {
        promptTokens: response.usage?.promptTokens,
        completionTokens: response.usage?.completionTokens,
        totalTokens: response.usage?.totalTokens,
      },
    };
  }
}

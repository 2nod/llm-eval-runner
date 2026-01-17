import { LLMClient } from "../llm/base";
import { ResolvedPrompt } from "../config/schema";
import { Constraints, DatasetSample, Issue, TranslationState } from "../types";
import { renderTemplate } from "../utils/template";

export const DEFAULT_REPAIR_TEMPLATE = `You improve an English translation based on reviewer issues.
Return only the corrected translation and obey every constraint.
# Source
{{text}}
# Context
{{context}}
# Current Translation
{{translation}}
# Issues JSON
{{issues}}
# Constraints
{{constraints}}
# State
{{state}}
`;

function applyHeuristics(draft: string, constraints: Constraints) {
  let output = draft;
  for (const pattern of constraints.bannedPatterns) {
    const regex = new RegExp(pattern, "gi");
    output = output.replace(regex, "");
  }
  if (constraints.format.maxChars && output.length > constraints.format.maxChars) {
    output = `${output.slice(0, constraints.format.maxChars - 1)}…`;
  }
  return output.trim();
}

export interface RepairResult {
  translation: string;
  usageTokens?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export class Repairer {
  constructor(
    private readonly llm: LLMClient | undefined,
    private readonly prompt: ResolvedPrompt | undefined
  ) {}

  async repair(
    sample: DatasetSample,
    translation: string,
    issues: Issue[],
    constraints: Constraints,
    state?: TranslationState
  ): Promise<RepairResult> {
    if (!issues.length) {
      return { translation };
    }
    if (!this.llm) {
      return { translation: applyHeuristics(translation, constraints) };
    }
    const template = this.prompt?.template ?? DEFAULT_REPAIR_TEMPLATE;
    const user = renderTemplate(template, {
      text: sample.ja.text,
      context: sample.ja.context ?? "(none)",
      translation,
      issues: JSON.stringify(issues, null, 2),
      constraints: JSON.stringify(constraints, null, 2),
      state: JSON.stringify(state ?? {}, null, 2),
    });
    const response = await this.llm.generate([
      { role: "system", content: this.prompt?.system ?? "You fix translations" },
      { role: "user", content: user },
    ]);
    return {
      translation: response.output.trim(),
      usageTokens: {
        promptTokens: response.usage?.promptTokens,
        completionTokens: response.usage?.completionTokens,
        totalTokens: response.usage?.totalTokens,
      },
    };
  }
}

import { LLMClient } from "../llm/base";
import { ResolvedPrompt } from "../config/schema";
import { DatasetSample, Constraints, Issue, HardCheckResult, TranslationState } from "../types";
import { HardCheckEngine } from "./hardChecks";
import { renderTemplate } from "../utils/template";
import { stableHash } from "../utils/hashing";

export interface VerificationResult {
  issues: Issue[];
  hardChecks: HardCheckResult[];
  usageTokens?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export const DEFAULT_VERIFIER_TEMPLATE = `You are a strict translation reviewer.
Compare the Japanese and the proposed English translation.
Return JSON with field issues: Issue[]. Each issue must contain id,type,severity,rationale,fixSuggestion,confidence (0..1).
Issue types allowed: MISTRANSLATION, OMISSION, ADDITION, TERM_INCONSISTENCY, PRONOUN_REFERENCE, SPEAKER_MISMATCH, STYLE_VIOLATION, FORMAT_VIOLATION, SAFETY_OR_POLICY, OTHER.
# Source (Japanese)
{{text}}
# Context
{{context}}
# Constraints
{{constraints}}
# Translation
{{translation}}
# State
{{state}}
`;

export class Verifier {
  constructor(
    private readonly llm: LLMClient | undefined,
    private readonly prompt: ResolvedPrompt | undefined,
    private readonly hardChecks: HardCheckEngine
  ) {}

  private async runLLM(
    sample: DatasetSample,
    translation: string,
    constraints: Constraints,
    state?: TranslationState
  ): Promise<{ issues: Issue[]; usageTokens?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
    if (!this.llm) return { issues: [] };
    const template = this.prompt?.template ?? DEFAULT_VERIFIER_TEMPLATE;
    const user = renderTemplate(template, {
      text: sample.ja.text,
      context: sample.ja.context ?? "(none)",
      constraints: JSON.stringify(constraints, null, 2),
      translation,
      state: JSON.stringify(state ?? {}, null, 2),
    });
    const response = await this.llm.generate([
      { role: "system", content: this.prompt?.system ?? "You are a translation QA bot." },
      { role: "user", content: user },
    ], { responseFormat: "json" });

    try {
      const parsed = JSON.parse(response.output);
      const issues: Issue[] = Array.isArray(parsed.issues)
        ? parsed.issues.map((issue: Issue) => ({
            ...issue,
            id: issue.id ?? stableHash([issue.type, issue.rationale]),
          }))
        : [];
      return {
        issues,
        usageTokens: {
          promptTokens: response.usage?.promptTokens,
          completionTokens: response.usage?.completionTokens,
          totalTokens: response.usage?.totalTokens,
        },
      };
    } catch (err) {
      return { issues: [] };
    }
  }

  async verify(sample: DatasetSample, translation: string, constraints: Constraints, state?: TranslationState): Promise<VerificationResult> {
    const hardChecks = this.hardChecks.run({
      translation,
      sample,
      constraints,
      draft: translation,
    });
    const hardIssues = hardChecks
      .filter((check) => !check.passed)
      .map((check): Issue => ({
        id: `${check.id}-${sample.id}`,
        type: check.id === "formatPreserved" ? "FORMAT_VIOLATION" : "STYLE_VIOLATION",
        severity: check.id === "noDisallowedJapanese" ? "major" : "minor",
        rationale: check.description,
        fixSuggestion: "Follow the constraint described",
        confidence: 0.8,
      }));
    const llmResult = await this.runLLM(sample, translation, constraints, state);
    return {
      issues: [...hardIssues, ...llmResult.issues],
      hardChecks,
      usageTokens: llmResult.usageTokens,
    };
  }
}

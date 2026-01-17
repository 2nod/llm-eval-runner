import { DatasetSample, Constraints, ScoreBreakdown, TranslationState } from "../types";
import { LLMClient } from "../llm/base";
import { ResolvedPrompt } from "../config/schema";
import { renderTemplate } from "../utils/template";
import { clamp01, median } from "../utils/stats";

export const DEFAULT_JUDGE_TEMPLATE = `Score the translation on adequacy, fluency, constraintCompliance, styleFit (0..1), and overall (0..1).
Return JSON { adequacy, fluency, constraintCompliance, styleFit, overall, rationale }.
# Source
{{text}}
# Context
{{context}}
# Constraints
{{constraints}}
# Translation
{{translation}}
# Reference (optional)
{{reference}}
# State
{{state}}
`;

function heuristicScore(sample: DatasetSample, translation: string): ScoreBreakdown {
  const reference = sample.reference?.en;
  const referenceTokens = reference?.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean) ?? [];
  const translationTokens = translation.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  const intersection = new Set(referenceTokens.filter((token) => translationTokens.includes(token)));
  const adequacy = referenceTokens.length
    ? intersection.size / referenceTokens.length
    : Math.min(1, translationTokens.length / Math.max(referenceTokens.length, 5));
  const fluency = /[a-z]/i.test(translation) ? 0.7 + Math.min(0.3, translation.length / 200) : 0.3;
  const constraintCompliance = 0.5 + Math.min(0.5, translation.length ? 0.2 : 0);
  const styleFit = 0.6;
  const overall = clamp01(adequacy * 0.4 + fluency * 0.2 + constraintCompliance * 0.25 + styleFit * 0.15);
  return {
    adequacy: clamp01(adequacy),
    fluency: clamp01(fluency),
    constraintCompliance: clamp01(constraintCompliance),
    styleFit: clamp01(styleFit),
    overall,
  };
}

export interface JudgeResult {
  scores: ScoreBreakdown;
  usageTokens?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export class Judge {
  constructor(
    private readonly llm: LLMClient | undefined,
    private readonly prompt: ResolvedPrompt | undefined,
    private readonly runs: number
  ) {}

  private async scoreWithLLM(
    sample: DatasetSample,
    translation: string,
    constraints: Constraints,
    state?: TranslationState
  ): Promise<JudgeResult> {
    if (!this.llm) {
      return { scores: heuristicScore(sample, translation) };
    }
    const template = this.prompt?.template ?? DEFAULT_JUDGE_TEMPLATE;
    const user = renderTemplate(template, {
      text: sample.ja.text,
      context: sample.ja.context ?? "(none)",
      constraints: JSON.stringify(constraints, null, 2),
      translation,
      reference: sample.reference?.en ?? "(not provided)",
      state: JSON.stringify(state ?? {}, null, 2),
    });
    const scores = [] as ScoreBreakdown[];
    let totalPrompt = 0;
    let totalCompletion = 0;
    const iterations = Math.max(1, this.runs);
    for (let i = 0; i < iterations; i++) {
      const response = await this.llm.generate([
        { role: "system", content: this.prompt?.system ?? "You are a meticulous translation judge" },
        { role: "user", content: user },
      ], { responseFormat: "json" });
      try {
        const parsed = JSON.parse(response.output);
        scores.push({
          adequacy: clamp01(parsed.adequacy ?? 0),
          fluency: clamp01(parsed.fluency ?? 0),
          constraintCompliance: clamp01(parsed.constraintCompliance ?? 0),
          styleFit: clamp01(parsed.styleFit ?? 0),
          overall: clamp01(parsed.overall ?? 0),
        });
        totalPrompt += response.usage?.promptTokens ?? 0;
        totalCompletion += response.usage?.completionTokens ?? 0;
      } catch (err) {
        scores.push(heuristicScore(sample, translation));
      }
    }
    const metrics = {
      adequacy: median(scores.map((s) => s.adequacy)),
      fluency: median(scores.map((s) => s.fluency)),
      constraintCompliance: median(scores.map((s) => s.constraintCompliance)),
      styleFit: median(scores.map((s) => s.styleFit)),
    };
    const overall = median(scores.map((s) => s.overall));
    return {
      scores: { ...metrics, overall },
      usageTokens: {
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion,
      },
    };
  }

  async score(
    sample: DatasetSample,
    translation: string,
    constraints: Constraints,
    state?: TranslationState
  ): Promise<JudgeResult> {
    return this.scoreWithLLM(sample, translation, constraints, state);
  }
}

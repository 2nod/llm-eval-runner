import { z } from "zod";

export const constraintSchema = z.object({
  targetLang: z.string().default("en"),
  tone: z.string().optional(),
  register: z.string().optional(),
  readingLevel: z.string().optional(),
  format: z
    .object({
      keepLineBreaks: z.boolean().optional(),
      maxChars: z.number().int().positive().optional(),
      noExtraPrefixSuffix: z.boolean().optional(),
    })
    .default({}),
  glossary: z
    .array(
      z.object({
        ja: z.string(),
        en: z.string(),
        strict: z.boolean().optional(),
      })
    )
    .default([]),
  bannedPatterns: z.array(z.string()).default([]),
  allowJapaneseTokens: z.array(z.string()).default([]),
});

export type Constraints = z.infer<typeof constraintSchema>;

export interface TranslationState {
  utterance: string;
  speaker: string;
  addressee?: string;
  entities: Array<{ name: string; description?: string }>;
  coreMeaning: string;
  implicature?: string;
}

export interface DatasetSample {
  id: string;
  ja: {
    text: string;
    context?: string;
  };
  constraints?: Partial<Constraints>;
  reference?: {
    en?: string;
  };
}

export type IssueType =
  | "MISTRANSLATION"
  | "OMISSION"
  | "ADDITION"
  | "TERM_INCONSISTENCY"
  | "PRONOUN_REFERENCE"
  | "SPEAKER_MISMATCH"
  | "STYLE_VIOLATION"
  | "FORMAT_VIOLATION"
  | "SAFETY_OR_POLICY"
  | "OTHER";

export type Severity = "critical" | "major" | "minor";

export interface Issue {
  id: string;
  type: IssueType;
  severity: Severity;
  sourceJa?: string;
  draftEnSnippet?: string;
  rationale: string;
  fixSuggestion: string;
  violatedConstraintIds?: string[];
  confidence: number;
}

export interface HardCheckResult {
  id: string;
  passed: boolean;
  description: string;
  details?: string;
}

export interface ScoreBreakdown {
  adequacy: number;
  fluency: number;
  constraintCompliance: number;
  styleFit: number;
  overall: number;
}

export interface UsageStats {
  model: Record<string, unknown>;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost?: {
    currency: string;
    amount: number;
  };
}

export interface TimingStats {
  totalMs: number;
  stages: Record<string, number>;
}

export interface RunRecord {
  runId: string;
  condition: "A0" | "A1" | "A2" | "A3";
  id: string;
  draft: {
    en: string;
  };
  final: {
    en: string;
  };
  verifier: {
    issues: Issue[];
    hardChecks: HardCheckResult[];
  };
  scores: {
    hard: Record<string, boolean>;
    judge: ScoreBreakdown;
    overall: number;
  };
  usage: UsageStats;
  timingMs: TimingStats;
  state?: TranslationState;
  constraintsNormalized?: Constraints;
  trace?: {
    langfuseTraceId?: string;
  };
  status?: "ok" | "needs_review";
}

export const conditionOrder = ["A0", "A1", "A2", "A3"] as const;
export type Condition = (typeof conditionOrder)[number];

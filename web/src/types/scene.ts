import { z } from "zod";

export const segmentSchema = z.object({
  t: z.number().int(),
  type: z.enum(["narration", "dialogue", "sfx"]),
  speaker: z.string().optional(),
  text: z.string(),
});

export const entitySchema = z.object({
  id: z.string(),
  type: z.enum(["person", "object", "location", "concept"]),
  canonical_name: z.string(),
  aliases: z.array(z.string()).default([]),
});

export const eventSchema = z.object({
  event_id: z.string(),
  t: z.number().int(),
  type: z.string(),
  participants: z.array(z.string()),
  status: z.enum(["done", "pending", "failed"]).default("done"),
});

export const factSchema = z.object({
  fact_id: z.string(),
  proposition: z.string(),
  valid_from: z.number().int(),
  valid_to: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  evidence_span: z.array(z.number().int()),
});

export const relationSchema = z.object({
  a: z.string(),
  b: z.string(),
  type: z.string(),
  valid_from: z.number().int(),
  valid_to: z.number().int().nullable(),
  confidence: z.number().min(0).max(1).optional(),
});

export const worldStateSchema = z.object({
  entities: z.array(entitySchema).default([]),
  events: z.array(eventSchema).default([]),
  facts: z.array(factSchema).default([]),
  relations: z.array(relationSchema).default([]),
});

export const observationSchema = z.object({
  t: z.number().int(),
  source: z.enum([
    "visual",
    "auditory",
    "self_action",
    "memory",
    "inference",
    "told",
  ]),
  content: z.string(),
  certainty: z.number().min(0).max(1),
  evidence_span: z.array(z.number().int()),
});

export const beliefSchema = z.object({
  t: z.number().int(),
  about: z.string(),
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  derived_from: z.array(z.string()),
  higher_order: z.boolean().optional(),
});

export const goalSchema = z.object({
  t: z.number().int(),
  content: z.string(),
  urgency: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1),
});

export const voiceProfileSchema = z.object({
  register: z.string(),
  politeness: z.string(),
  catchphrases: z.array(z.string()).optional(),
  taboo_words: z.array(z.string()).optional(),
  snark: z.string().optional(),
});

export const characterStateSchema = z.object({
  observations: z.array(observationSchema).default([]),
  beliefs: z.array(beliefSchema).default([]),
  goals: z.array(goalSchema).default([]),
  voice_profile: voiceProfileSchema.optional(),
});

export const glossaryEntrySchema = z.object({
  ja: z.string(),
  en: z.string(),
  strict: z.boolean().optional(),
});

export const formatConstraintSchema = z.object({
  keepLineBreaks: z.boolean().optional(),
  maxChars: z.number().int().positive().optional(),
  noExtraPrefixSuffix: z.boolean().optional(),
});

export const layoutConstraintSchema = z.object({
  max_chars: z.number().int().positive().optional(),
  max_lines: z.number().int().positive().optional(),
});

export const styleGuideSchema = z.object({
  target: z.string().optional(),
  keep_vagueness: z.boolean().optional(),
  keep_uncertainty_markers: z.boolean().optional(),
});

export const constraintsSchema = z.object({
  glossary: z.array(glossaryEntrySchema).default([]),
  tone: z.string().optional(),
  register: z.string().optional(),
  format: formatConstraintSchema.optional(),
  bannedPatterns: z.array(z.string()).default([]),
  allowJapaneseTokens: z.array(z.string()).default([]),
  style_guide: styleGuideSchema.optional(),
  layout: layoutConstraintSchema.optional(),
  rating: z.string().optional(),
  publisher_rules: z.array(z.string()).default([]),
});

export const fatalRiskSchema = z.object({
  t: z.number().int(),
  type: z.enum(["KL", "FB", "REF", "IMPL", "LEX", "CONS"]),
  severity: z.enum(["fatal", "major", "minor"]).default("fatal"),
  description: z.string(),
  linked_state: z.array(z.string()).default([]),
  evidence_span: z.array(z.number().int()).optional(),
});

export const evalTargetsSchema = z.object({
  fatal_risks: z.array(fatalRiskSchema).default([]),
});

export const sceneSchema = z.object({
  scene_id: z.string(),
  lang_src: z.string().default("ja"),
  lang_tgt: z.string().default("en"),
  segments: z.array(segmentSchema),
  world_state: worldStateSchema,
  character_states: z.record(z.string(), characterStateSchema),
  constraints: constraintsSchema,
  eval_targets: evalTargetsSchema,
});

export type Segment = z.infer<typeof segmentSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type Event = z.infer<typeof eventSchema>;
export type Fact = z.infer<typeof factSchema>;
export type Relation = z.infer<typeof relationSchema>;
export type WorldState = z.infer<typeof worldStateSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Belief = z.infer<typeof beliefSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;
export type CharacterState = z.infer<typeof characterStateSchema>;
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
export type Constraints = z.infer<typeof constraintsSchema>;
export type FatalRisk = z.infer<typeof fatalRiskSchema>;
export type EvalTargets = z.infer<typeof evalTargetsSchema>;
export type Scene = z.infer<typeof sceneSchema>;

export type ErrorType = "KL" | "FB" | "REF" | "IMPL" | "LEX" | "CONS";
export type Severity = "fatal" | "major" | "minor";
export type Split = "train" | "dev" | "test";

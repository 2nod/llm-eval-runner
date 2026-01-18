import { z } from "zod";

export const segmentSchema = z.object({
  speaker: z.string().optional(),
  t: z.number().int(),
  text: z.string(),
  type: z.enum(["narration", "dialogue", "sfx"]),
});

export const entitySchema = z.object({
  aliases: z.array(z.string()).default([]),
  canonical_name: z.string(),
  id: z.string(),
  type: z.enum(["person", "object", "location", "concept"]),
});

export const eventSchema = z.object({
  event_id: z.string(),
  participants: z.array(z.string()),
  status: z.enum(["done", "pending", "failed"]).default("done"),
  t: z.number().int(),
  type: z.string(),
});

export const factSchema = z.object({
  confidence: z.number().min(0).max(1),
  evidence_span: z.array(z.number().int()),
  fact_id: z.string(),
  proposition: z.string(),
  valid_from: z.number().int(),
  valid_to: z.number().int().nullable(),
});

export const relationSchema = z.object({
  a: z.string(),
  b: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  type: z.string(),
  valid_from: z.number().int(),
  valid_to: z.number().int().nullable(),
});

export const worldStateSchema = z.object({
  entities: z.array(entitySchema).default([]),
  events: z.array(eventSchema).default([]),
  facts: z.array(factSchema).default([]),
  relations: z.array(relationSchema).default([]),
});

export const observationSchema = z.object({
  certainty: z.number().min(0).max(1),
  content: z.string(),
  evidence_span: z.array(z.number().int()),
  source: z.enum([
    "visual",
    "auditory",
    "self_action",
    "memory",
    "inference",
    "told",
  ]),
  t: z.number().int(),
});

export const beliefSchema = z.object({
  about: z.string(),
  confidence: z.number().min(0).max(1),
  derived_from: z.array(z.string()),
  higher_order: z.boolean().optional(),
  t: z.number().int(),
  value: z.unknown(),
});

export const goalSchema = z.object({
  confidence: z.number().min(0).max(1),
  content: z.string(),
  t: z.number().int(),
  urgency: z.number().min(0).max(1).optional(),
});

export const voiceProfileSchema = z.object({
  catchphrases: z.array(z.string()).optional(),
  politeness: z.string(),
  register: z.string(),
  snark: z.string().optional(),
  taboo_words: z.array(z.string()).optional(),
});

export const characterStateSchema = z.object({
  beliefs: z.array(beliefSchema).default([]),
  goals: z.array(goalSchema).default([]),
  observations: z.array(observationSchema).default([]),
  voice_profile: voiceProfileSchema.optional(),
});

export const glossaryEntrySchema = z.object({
  en: z.string(),
  ja: z.string(),
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
  keep_uncertainty_markers: z.boolean().optional(),
  keep_vagueness: z.boolean().optional(),
  target: z.string().optional(),
});

export const constraintsSchema = z.object({
  allowJapaneseTokens: z.array(z.string()).default([]),
  bannedPatterns: z.array(z.string()).default([]),
  format: formatConstraintSchema.optional(),
  glossary: z.array(glossaryEntrySchema).default([]),
  layout: layoutConstraintSchema.optional(),
  publisher_rules: z.array(z.string()).default([]),
  rating: z.string().optional(),
  register: z.string().optional(),
  style_guide: styleGuideSchema.optional(),
  tone: z.string().optional(),
});

export const fatalRiskSchema = z.object({
  description: z.string(),
  evidence_span: z.array(z.number().int()).optional(),
  linked_state: z.array(z.string()).default([]),
  severity: z.enum(["fatal", "major", "minor"]).default("fatal"),
  t: z.number().int(),
  type: z.enum(["KL", "FB", "REF", "IMPL", "LEX", "CONS"]),
});

export const evalTargetsSchema = z.object({
  fatal_risks: z.array(fatalRiskSchema).default([]),
});

export const sceneSchema = z.object({
  character_states: z.record(z.string(), characterStateSchema),
  constraints: constraintsSchema,
  eval_targets: evalTargetsSchema,
  lang_src: z.string().default("ja"),
  lang_tgt: z.string().default("en"),
  scene_id: z.string(),
  segments: z.array(segmentSchema),
  world_state: worldStateSchema,
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

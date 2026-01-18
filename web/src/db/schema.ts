import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const scenes = sqliteTable("scenes", {
  characterStates: text("character_states", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  constraints: text("constraints", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  evalTargets: text("eval_targets", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  id: text("id").primaryKey(),
  langSrc: text("lang_src").notNull().default("ja"),
  langTgt: text("lang_tgt").notNull().default("en"),
  sceneId: text("scene_id").notNull().unique(),
  segments: text("segments", { mode: "json" }).notNull().$type<unknown[]>(),
  split: text("split").$type<"train" | "dev" | "test">(),
  tags: text("tags", { mode: "json" }).default("[]").$type<string[]>(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  worldState: text("world_state", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
});

export const experiments = sqliteTable("experiments", {
  conditions: text("conditions", { mode: "json" }).notNull().$type<string[]>(),
  config: text("config", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  description: text("description"),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sceneFilter: text("scene_filter", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  status: text("status")
    .default("draft")
    .$type<"draft" | "running" | "completed" | "failed">(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const runs = sqliteTable("runs", {
  condition: text("condition").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  draftEn: text("draft_en"),
  experimentId: text("experiment_id").references(() => experiments.id),
  finalEn: text("final_en"),
  hardChecks: text("hard_checks", { mode: "json" }).$type<unknown[]>(),
  id: text("id").primaryKey(),
  issues: text("issues", { mode: "json" }).$type<unknown[]>(),
  runId: text("run_id").notNull(),
  sceneId: text("scene_id").references(() => scenes.id),
  scores: text("scores", { mode: "json" }).$type<Record<string, unknown>>(),
  segmentT: integer("segment_t"),
  state: text("state", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status").$type<"ok" | "needs_review" | "error">(),
  timingMs: text("timing_ms", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  usage: text("usage", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const annotations = sqliteTable("annotations", {
  annotator: text("annotator"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  errorType: text("error_type").$type<
    "KL" | "FB" | "REF" | "IMPL" | "LEX" | "CONS"
  >(),
  fixSuggestion: text("fix_suggestion"),
  id: text("id").primaryKey(),
  linkedState: text("linked_state", { mode: "json" }).$type<string[]>(),
  rationale: text("rationale"),
  runId: text("run_id").references(() => runs.id),
  sceneId: text("scene_id").references(() => scenes.id),
  segmentT: integer("segment_t"),
  severity: text("severity").$type<"fatal" | "major" | "minor">(),
});

export const aggregatedResults = sqliteTable("aggregated_results", {
  avgScores: text("avg_scores", { mode: "json" }).$type<
    Record<string, number>
  >(),
  condition: text("condition").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  errorCounts: text("error_counts", { mode: "json" }).$type<
    Record<string, number>
  >(),
  experimentId: text("experiment_id").references(() => experiments.id),
  fatalErrorRate: real("fatal_error_rate"),
  id: text("id").primaryKey(),
  split: text("split").$type<"train" | "dev" | "test">(),
  totalScenes: integer("total_scenes").notNull(),
  totalSegments: integer("total_segments").notNull(),
});

export type SceneRow = typeof scenes.$inferSelect;
export type NewSceneRow = typeof scenes.$inferInsert;
export type ExperimentRow = typeof experiments.$inferSelect;
export type NewExperimentRow = typeof experiments.$inferInsert;
export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;
export type AnnotationRow = typeof annotations.$inferSelect;
export type NewAnnotationRow = typeof annotations.$inferInsert;

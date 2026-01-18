import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const scenes = sqliteTable("scenes", {
  id: text("id").primaryKey(),
  sceneId: text("scene_id").notNull().unique(),
  langSrc: text("lang_src").notNull().default("ja"),
  langTgt: text("lang_tgt").notNull().default("en"),
  segments: text("segments", { mode: "json" }).notNull().$type<unknown[]>(),
  worldState: text("world_state", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  characterStates: text("character_states", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  constraints: text("constraints", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  evalTargets: text("eval_targets", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  split: text("split").$type<"train" | "dev" | "test">(),
  tags: text("tags", { mode: "json" }).default("[]").$type<string[]>(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  config: text("config", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  conditions: text("conditions", { mode: "json" }).notNull().$type<string[]>(),
  sceneFilter: text("scene_filter", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  status: text("status")
    .default("draft")
    .$type<"draft" | "running" | "completed" | "failed">(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  experimentId: text("experiment_id").references(() => experiments.id),
  runId: text("run_id").notNull(),
  sceneId: text("scene_id").references(() => scenes.id),
  condition: text("condition").notNull(),
  segmentT: integer("segment_t"),
  draftEn: text("draft_en"),
  finalEn: text("final_en"),
  issues: text("issues", { mode: "json" }).$type<unknown[]>(),
  hardChecks: text("hard_checks", { mode: "json" }).$type<unknown[]>(),
  scores: text("scores", { mode: "json" }).$type<Record<string, unknown>>(),
  usage: text("usage", { mode: "json" }).$type<Record<string, unknown>>(),
  timingMs: text("timing_ms", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  state: text("state", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status").$type<"ok" | "needs_review" | "error">(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => runs.id),
  sceneId: text("scene_id").references(() => scenes.id),
  segmentT: integer("segment_t"),
  errorType: text("error_type").$type<
    "KL" | "FB" | "REF" | "IMPL" | "LEX" | "CONS"
  >(),
  severity: text("severity").$type<"fatal" | "major" | "minor">(),
  linkedState: text("linked_state", { mode: "json" }).$type<string[]>(),
  rationale: text("rationale"),
  fixSuggestion: text("fix_suggestion"),
  annotator: text("annotator"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const aggregatedResults = sqliteTable("aggregated_results", {
  id: text("id").primaryKey(),
  experimentId: text("experiment_id").references(() => experiments.id),
  condition: text("condition").notNull(),
  split: text("split").$type<"train" | "dev" | "test">(),
  totalScenes: integer("total_scenes").notNull(),
  totalSegments: integer("total_segments").notNull(),
  errorCounts: text("error_counts", { mode: "json" }).$type<
    Record<string, number>
  >(),
  avgScores: text("avg_scores", { mode: "json" }).$type<
    Record<string, number>
  >(),
  fatalErrorRate: real("fatal_error_rate"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export type SceneRow = typeof scenes.$inferSelect;
export type NewSceneRow = typeof scenes.$inferInsert;
export type ExperimentRow = typeof experiments.$inferSelect;
export type NewExperimentRow = typeof experiments.$inferInsert;
export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;
export type AnnotationRow = typeof annotations.$inferSelect;
export type NewAnnotationRow = typeof annotations.$inferInsert;

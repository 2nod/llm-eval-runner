import { readFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";
import { db, schema } from "./client";

type SceneData = {
  scene_id: string;
  lang_src?: string;
  lang_tgt?: string;
  segments: unknown[];
  world_state: Record<string, unknown>;
  character_states: Record<string, unknown>;
  constraints: Record<string, unknown>;
  eval_targets: Record<string, unknown>;
};

function shouldSeedDatabase(dbPath: string) {
  const explicit = process.env["SEED_DATABASE"];
  if (explicit === "1" || explicit === "true") return true;
  return dbPath.startsWith("/tmp/");
}

function resolveSeedPath() {
  const configured = process.env["SEED_SCENES_PATH"];
  if (configured && configured.trim()) return configured;
  return path.resolve(process.cwd(), "..", "datasets", "synth.scenes.jsonl");
}

function parseJsonl(content: string): SceneData[] {
  const lines = content.split("\n");
  const scenes: SceneData[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    scenes.push(JSON.parse(trimmed) as SceneData);
  }
  return scenes;
}

export async function seedDatabaseIfEmpty() {
  const dbPath = process.env["DATABASE_URL"] ?? "./data/eval.db";
  if (!shouldSeedDatabase(dbPath)) return;

  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.scenes);
  const count = existing[0]?.count ?? 0;
  if (count > 0) return;

  const seedPath = resolveSeedPath();
  let content: string;
  try {
    content = await readFile(seedPath, "utf-8");
  } catch (err) {
    console.warn(`Seed file not found: ${seedPath}`);
    return;
  }

  const scenes = parseJsonl(content);
  if (scenes.length === 0) return;

  const split = process.env["SEED_SCENES_SPLIT"] ?? "dev";
  const rows = scenes.map((scene) => ({
    id: nanoid(),
    sceneId: scene.scene_id,
    langSrc: scene.lang_src ?? "ja",
    langTgt: scene.lang_tgt ?? "en",
    segments: scene.segments,
    worldState: scene.world_state,
    characterStates: scene.character_states,
    constraints: scene.constraints,
    evalTargets: scene.eval_targets,
    split,
    tags: [],
  }));

  await db.insert(schema.scenes).values(rows);
  console.log(`Seeded ${rows.length} scenes from ${seedPath}`);
}

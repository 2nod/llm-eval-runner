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

function logSeed(message: string) {
  console.log(`[seed] ${message}`);
}

function logSeedWarning(message: string) {
  console.warn(`[seed] ${message}`);
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
  const shouldSeed = shouldSeedDatabase(dbPath);
  logSeed(`Seed check: dbPath=${dbPath} shouldSeed=${shouldSeed}`);
  if (!shouldSeed) {
    logSeed("Skip: SEED_DATABASE not set and dbPath is not /tmp.");
    return;
  }

  const seedSplit = process.env["SEED_SCENES_SPLIT"] ?? "dev";
  const existingScenes = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.scenes);
  let sceneCount = existingScenes[0]?.count ?? 0;
  if (sceneCount > 0) {
    logSeed(`Skip: scenes already present (count=${sceneCount}).`);
  } else {
    const seedPath = resolveSeedPath();
    logSeed(`Using seed file: ${seedPath}`);
    let content: string;
    try {
      content = await readFile(seedPath, "utf-8");
    } catch {
      logSeedWarning(`Seed file not found: ${seedPath}`);
      content = "";
    }

    if (content.trim().length > 0) {
      const scenes = parseJsonl(content);
      if (scenes.length === 0) {
        logSeedWarning("Seed file is empty.");
      } else {
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
          split: seedSplit,
          tags: [],
        }));

        await db.insert(schema.scenes).values(rows);
        sceneCount = rows.length;
        logSeed(
          `Seeded ${rows.length} scenes from ${seedPath} (split=${seedSplit}).`,
        );
      }
    }
  }

  const existingExperiments = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.experiments);
  const experimentCount = existingExperiments[0]?.count ?? 0;
  if (experimentCount > 0) {
    logSeed(`Skip: experiments already present (count=${experimentCount}).`);
    return;
  }

  const experiment: typeof schema.experiments.$inferInsert = {
    id: nanoid(),
    name: "Seeded Preview Experiment",
    description: "Seeded experiment for preview environments.",
    config: {
      name: "Seeded Preview Experiment",
      components: {
        translator: {
          model: { provider: "openai", name: "gpt-5-mini", temperature: 1 },
        },
      },
    },
    conditions: ["A0", "A1", "A2", "A3"],
    status: "draft",
  };
  if (sceneCount > 0) {
    experiment.sceneFilter = { split: seedSplit };
  }

  await db.insert(schema.experiments).values([experiment]);
  logSeed("Seeded 1 experiment.");
}

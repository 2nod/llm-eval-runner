import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { db, schema } from "./client";

interface SceneData {
  scene_id: string;
  lang_src?: string;
  lang_tgt?: string;
  segments: unknown[];
  world_state: Record<string, unknown>;
  character_states: Record<string, unknown>;
  constraints: Record<string, unknown>;
  eval_targets: Record<string, unknown>;
}

const shouldSeedDatabase = (dbPath: string) => {
  const explicit = process.env["SEED_DATABASE"];
  if (explicit === "1" || explicit === "true") {
    return true;
  }
  return dbPath.startsWith("/tmp/");
};

const logSeed = (message: string) => {
  console.log(`[seed] ${message}`);
};

const logSeedWarning = (message: string) => {
  console.warn(`[seed] ${message}`);
};

const resolveSeedPath = () => {
  const configured = process.env["SEED_SCENES_PATH"];
  if (configured && configured.trim()) {
    return configured;
  }
  return path.resolve(process.cwd(), "..", "datasets", "synth.scenes.jsonl");
};

const parseJsonl = (content: string): SceneData[] => {
  const lines = content.split("\n");
  const scenes: SceneData[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    scenes.push(JSON.parse(trimmed) as SceneData);
  }
  return scenes;
};

const fetchSceneCount = async () => {
  const existingScenes = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.scenes);
  return existingScenes[0]?.count ?? 0;
};

const readSeedContent = async (seedPath: string) => {
  try {
    return await readFile(seedPath, "utf8");
  } catch {
    logSeedWarning(`Seed file not found: ${seedPath}`);
    return "";
  }
};

const buildSceneRows = (scenes: SceneData[], seedSplit: string) =>
  scenes.map((scene) => ({
    characterStates: scene.character_states,
    constraints: scene.constraints,
    evalTargets: scene.eval_targets,
    id: nanoid(),
    langSrc: scene.lang_src ?? "ja",
    langTgt: scene.lang_tgt ?? "en",
    sceneId: scene.scene_id,
    segments: scene.segments,
    split: seedSplit,
    tags: [],
    worldState: scene.world_state,
  }));

const loadSeedScenes = async (seedPath: string) => {
  const content = await readSeedContent(seedPath);
  if (content.trim().length === 0) {
    return [] as SceneData[];
  }

  const scenes = parseJsonl(content);
  if (scenes.length === 0) {
    logSeedWarning("Seed file is empty.");
  }
  return scenes;
};

const insertSeedScenes = async (
  seedPath: string,
  seedSplit: string,
  scenes: SceneData[]
) => {
  const rows = buildSceneRows(scenes, seedSplit);
  await db.insert(schema.scenes).values(rows);
  logSeed(
    `Seeded ${rows.length} scenes from ${seedPath} (split=${seedSplit}).`
  );
  return rows.length;
};

const seedScenesIfMissing = async (seedSplit: string) => {
  const sceneCount = await fetchSceneCount();
  if (sceneCount > 0) {
    logSeed(`Skip: scenes already present (count=${sceneCount}).`);
    return sceneCount;
  }

  const seedPath = resolveSeedPath();
  logSeed(`Using seed file: ${seedPath}`);
  const scenes = await loadSeedScenes(seedPath);
  if (scenes.length === 0) {
    return 0;
  }

  return insertSeedScenes(seedPath, seedSplit, scenes);
};

const ensureNoExperiments = async () => {
  const existingExperiments = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.experiments);
  const experimentCount = existingExperiments[0]?.count ?? 0;
  if (experimentCount > 0) {
    logSeed(`Skip: experiments already present (count=${experimentCount}).`);
    return false;
  }
  return true;
};

const buildSeedExperiment = (seedSplit: string, sceneCount: number) => {
  const experiment: typeof schema.experiments.$inferInsert = {
    conditions: ["A0", "A1", "A2", "A3"],
    config: {
      components: {
        translator: {
          model: { name: "gpt-5-mini", provider: "openai", temperature: 1 },
        },
      },
      name: "Seeded Preview Experiment",
    },
    description: "Seeded experiment for preview environments.",
    id: nanoid(),
    name: "Seeded Preview Experiment",
    status: "draft",
  };

  if (sceneCount > 0) {
    experiment.sceneFilter = { split: seedSplit };
  }

  return experiment;
};

const insertSeedExperiment = async (
  experiment: typeof schema.experiments.$inferInsert
) => {
  await db.insert(schema.experiments).values([experiment]);
  logSeed("Seeded 1 experiment.");
};

const shouldProceedWithSeed = (dbPath: string) => {
  const shouldSeed = shouldSeedDatabase(dbPath);
  logSeed(`Seed check: dbPath=${dbPath} shouldSeed=${shouldSeed}`);
  if (!shouldSeed) {
    logSeed("Skip: SEED_DATABASE not set and dbPath is not /tmp.");
    return false;
  }
  return true;
};

const seedExperimentIfMissing = async (
  seedSplit: string,
  sceneCount: number
) => {
  if (!(await ensureNoExperiments())) {
    return;
  }

  const experiment = buildSeedExperiment(seedSplit, sceneCount);
  await insertSeedExperiment(experiment);
};

export const seedDatabaseIfEmpty = async () => {
  const dbPath = process.env["DATABASE_URL"] ?? "./data/eval.db";
  if (!shouldProceedWithSeed(dbPath)) {
    return;
  }

  const seedSplit = process.env["SEED_SCENES_SPLIT"] ?? "dev";
  const sceneCount = await seedScenesIfMissing(seedSplit);
  await seedExperimentIfMissing(seedSplit, sceneCount);
};

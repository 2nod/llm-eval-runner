import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { nanoid } from "nanoid";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import * as schema from "../src/db/schema";

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

const parseJsonl = (content: string): SceneData[] => {
  const lines = content.trim().split("\n");
  const scenes: SceneData[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as SceneData;
      scenes.push(parsed);
    } catch {
      console.error("Failed to parse line:", line.slice(0, 100));
    }
  }

  return scenes;
};

const printUsage = () => {
  console.log(
    "Usage: bun run scripts/import-scenes.ts <jsonl-file> [--split=train|dev|test]"
  );
  console.log("");
  console.log("Example:");
  console.log(
    "  bun run scripts/import-scenes.ts ../datasets/synth.scenes.jsonl --split=train"
  );
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const filePath = resolve(args[0] ?? "");
  const splitArg = args.find((a) => a.startsWith("--split="));
  const split = splitArg?.split("=")[1] as "train" | "dev" | "test" | undefined;
  return { filePath, split };
};

const ensureFileExists = (filePath: string) => {
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
};

const prepareDatabase = () => {
  const dbPath = resolve(dirname(import.meta.path), "../data/eval.db");
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(dbPath, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL UNIQUE,
      lang_src TEXT NOT NULL DEFAULT 'ja',
      lang_tgt TEXT NOT NULL DEFAULT 'en',
      segments TEXT NOT NULL,
      world_state TEXT NOT NULL,
      character_states TEXT NOT NULL,
      constraints TEXT NOT NULL,
      eval_targets TEXT NOT NULL,
      split TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
};

const loadScenes = (filePath: string) => {
  console.log(`Reading ${filePath}...`);
  const content = readFileSync(filePath, "utf8");
  const scenes = parseJsonl(content);
  console.log(`Found ${scenes.length} scenes`);
  return scenes;
};

type ImportResult = "error" | "imported" | "skipped";

const createImportCounts = () => ({ errors: 0, imported: 0, skipped: 0 });

const updateImportCounts = (
  counts: ReturnType<typeof createImportCounts>,
  result: ImportResult
) => {
  switch (result) {
    case "error": {
      counts.errors += 1;
      break;
    }
    case "imported": {
      counts.imported += 1;
      break;
    }
    case "skipped": {
      counts.skipped += 1;
      break;
    }
    default: {
      break;
    }
  }
};

const hasScene = async (db: ReturnType<typeof drizzle>, sceneId: string) => {
  const existing = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.sceneId, sceneId))
    .limit(1);
  return existing.length > 0;
};

const insertScene = async (
  db: ReturnType<typeof drizzle>,
  scene: SceneData,
  split: "train" | "dev" | "test" | undefined
) => {
  await db.insert(schema.scenes).values({
    characterStates: scene.character_states,
    constraints: scene.constraints,
    evalTargets: scene.eval_targets,
    id: nanoid(),
    langSrc: scene.lang_src ?? "ja",
    langTgt: scene.lang_tgt ?? "en",
    sceneId: scene.scene_id,
    segments: scene.segments,
    split,
    tags: [],
    worldState: scene.world_state,
  });
};

const importScene = async (
  db: ReturnType<typeof drizzle>,
  scene: SceneData,
  split: "train" | "dev" | "test" | undefined
) => {
  if (await hasScene(db, scene.scene_id)) {
    return "skipped" as const;
  }
  await insertScene(db, scene, split);
  return "imported" as const;
};

const importSceneWithResult = async (
  db: ReturnType<typeof drizzle>,
  scene: SceneData,
  split: "train" | "dev" | "test" | undefined
) => {
  try {
    return await importScene(db, scene, split);
  } catch (error) {
    console.error(`Error importing ${scene.scene_id}:`, error);
    return "error" as const;
  }
};

const importScenes = async (
  db: ReturnType<typeof drizzle>,
  scenes: SceneData[],
  split: "train" | "dev" | "test" | undefined
) => {
  const counts = createImportCounts();

  for (const scene of scenes) {
    const result = await importSceneWithResult(db, scene, split);
    updateImportCounts(counts, result);
  }

  return counts;
};

const logSummary = (results: {
  errors: number;
  imported: number;
  skipped: number;
}) => {
  console.log("");
  console.log("Import complete:");
  console.log(`  Imported: ${results.imported}`);
  console.log(`  Skipped (already exists): ${results.skipped}`);
  console.log(`  Errors: ${results.errors}`);
};

const main = async () => {
  const { filePath, split } = parseArgs();
  ensureFileExists(filePath);
  const { db, sqlite } = prepareDatabase();
  const scenes = loadScenes(filePath);
  const results = await importScenes(db, scenes, split);
  logSummary(results);
  sqlite.close();
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { nanoid } from "nanoid";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
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

function parseJsonl(content: string): SceneData[] {
  const lines = content.trim().split("\n");
  const scenes: SceneData[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as SceneData;
      scenes.push(parsed);
    } catch {
      console.error("Failed to parse line:", line.slice(0, 100));
    }
  }

  return scenes;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(
      "Usage: bun run scripts/import-scenes.ts <jsonl-file> [--split=train|dev|test]",
    );
    console.log("");
    console.log("Example:");
    console.log(
      "  bun run scripts/import-scenes.ts ../datasets/synth.scenes.jsonl --split=train",
    );
    process.exit(1);
  }

  const filePath = resolve(args[0] ?? "");
  const splitArg = args.find((a) => a.startsWith("--split="));
  const split = splitArg?.split("=")[1] as "train" | "dev" | "test" | undefined;

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

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

  console.log(`Reading ${filePath}...`);
  const content = readFileSync(filePath, "utf-8");
  const scenes = parseJsonl(content);

  console.log(`Found ${scenes.length} scenes`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const scene of scenes) {
    try {
      const existing = await db
        .select()
        .from(schema.scenes)
        .where(
          (await import("drizzle-orm")).eq(
            schema.scenes.sceneId,
            scene.scene_id,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(schema.scenes).values({
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
      });

      imported++;
    } catch (err) {
      console.error(`Error importing ${scene.scene_id}:`, err);
      errors++;
    }
  }

  console.log("");
  console.log("Import complete:");
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  sqlite.close();
}

main().catch(console.error);

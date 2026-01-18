import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const dbPath = process.env["DATABASE_URL"] ?? "./data/eval.db";
const dbDir = path.dirname(dbPath);
if (dbDir && dbDir !== ".") {
  fs.mkdirSync(dbDir, { recursive: true });
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
  );
  CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    config TEXT NOT NULL,
    conditions TEXT NOT NULL,
    scene_filter TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    experiment_id TEXT REFERENCES experiments(id),
    run_id TEXT NOT NULL,
    scene_id TEXT REFERENCES scenes(id),
    condition TEXT NOT NULL,
    segment_t INTEGER,
    draft_en TEXT,
    final_en TEXT,
    issues TEXT,
    hard_checks TEXT,
    scores TEXT,
    usage TEXT,
    timing_ms TEXT,
    state TEXT,
    status TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    run_id TEXT REFERENCES runs(id),
    scene_id TEXT REFERENCES scenes(id),
    segment_t INTEGER,
    error_type TEXT,
    severity TEXT,
    linked_state TEXT,
    rationale TEXT,
    fix_suggestion TEXT,
    annotator TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS aggregated_results (
    id TEXT PRIMARY KEY,
    experiment_id TEXT REFERENCES experiments(id),
    condition TEXT NOT NULL,
    split TEXT,
    total_scenes INTEGER NOT NULL,
    total_segments INTEGER NOT NULL,
    error_counts TEXT,
    avg_scores TEXT,
    fatal_error_rate REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

export const db = drizzle(sqlite, { schema });

export { schema };

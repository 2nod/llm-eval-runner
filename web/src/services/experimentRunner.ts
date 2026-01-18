import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client";

type SceneFilter = {
  split?: "train" | "dev" | "test";
  tags?: string[];
  sceneIds?: string[];
};

type SegmentLike = {
  t: number;
  text: string;
  type?: string;
  speaker?: string;
};

type SampleMeta = {
  sceneDbId: string;
  segmentT: number;
};

const conditionOrder = ["A0", "A1", "A2", "A3"] as const;
type Condition = (typeof conditionOrder)[number];

type DatasetSample = {
  id: string;
  ja: {
    text: string;
    context?: string;
  };
  constraints?: Record<string, unknown>;
};

type RunRecord = {
  runId: string;
  condition: Condition;
  id: string;
  draft: { en: string };
  final: { en: string };
  verifier: { issues: unknown[]; hardChecks: unknown[] };
  scores: Record<string, unknown>;
  usage: Record<string, unknown>;
  timingMs: Record<string, unknown>;
  state?: Record<string, unknown>;
  status?: "ok" | "needs_review" | "error";
};

type LoadedConfig = Record<string, unknown> & { baseDir: string };

type ExperimentStatusCode = 400 | 409 | 422;

export class ExperimentStartError extends Error {
  readonly status: ExperimentStatusCode;

  constructor(message: string, status: ExperimentStatusCode = 400) {
    super(message);
    this.name = "ExperimentStartError";
    this.status = status;
  }
}

const DEFAULT_BASE_DIR = (() => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, "..", "..", "..");
})();

function resolveBaseDir() {
  return process.env["EXPERIMENT_BASE_DIR"] ?? DEFAULT_BASE_DIR;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSceneFilter(raw: unknown): SceneFilter {
  if (!isRecord(raw)) return {};
  const filter: SceneFilter = {};
  const split =
    raw["split"] === "train" ||
    raw["split"] === "dev" ||
    raw["split"] === "test"
      ? raw["split"]
      : undefined;
  if (split) {
    filter.split = split;
  }
  const tags = Array.isArray(raw["tags"])
    ? raw["tags"].filter((tag) => typeof tag === "string")
    : [];
  if (tags.length > 0) {
    filter.tags = tags;
  }
  const sceneIds = Array.isArray(raw["sceneIds"])
    ? raw["sceneIds"].filter((id) => typeof id === "string")
    : [];
  if (sceneIds.length > 0) {
    filter.sceneIds = sceneIds;
  }
  return filter;
}

function normalizeConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  const requested = new Set(
    raw.filter((value): value is Condition => conditionOrder.includes(value)),
  );
  return conditionOrder.filter((condition) => requested.has(condition));
}

async function loadExperimentConfig(raw: unknown): Promise<LoadedConfig> {
  const baseDir = resolveBaseDir();
  let configValue = raw;
  if (typeof raw === "string") {
    try {
      configValue = JSON.parse(raw);
    } catch {
      throw new ExperimentStartError("Experiment config is not valid JSON");
    }
  }
  const moduleUrl = new URL("../../../src/config/schema.ts", import.meta.url);
  const module = (await import(moduleUrl.href)) as {
    configSchema: { parse: (value: unknown) => Record<string, unknown> };
  };
  const parsed = module.configSchema.parse(configValue);
  return { ...parsed, baseDir };
}

async function fetchScenes(filter: SceneFilter) {
  const conditions = [];
  if (filter.split) {
    conditions.push(eq(schema.scenes.split, filter.split));
  }
  if (filter.sceneIds && filter.sceneIds.length > 0) {
    conditions.push(inArray(schema.scenes.sceneId, filter.sceneIds));
  }

  const rows = await db
    .select()
    .from(schema.scenes)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  if (!filter.tags || filter.tags.length === 0) {
    return rows;
  }

  return rows.filter((scene) => {
    const tags = Array.isArray(scene.tags) ? scene.tags : [];
    return filter.tags?.every((tag) => tags.includes(tag));
  });
}

function formatSegmentContext(segment: SegmentLike) {
  const typePrefix =
    typeof segment.type === "string" && segment.type !== "dialogue"
      ? `[${segment.type}] `
      : "";
  const speakerPrefix =
    typeof segment.speaker === "string" ? `${segment.speaker}: ` : "";
  return `${typePrefix}${speakerPrefix}${segment.text}`;
}

function buildDatasetSamples(scenes: Array<typeof schema.scenes.$inferSelect>) {
  const samples: DatasetSample[] = [];
  const sampleMeta = new Map<string, SampleMeta>();

  for (const scene of scenes) {
    const rawSegments = Array.isArray(scene.segments)
      ? (scene.segments as SegmentLike[])
      : [];
    const segments = rawSegments
      .filter(
        (segment) =>
          segment &&
          typeof segment.t === "number" &&
          typeof segment.text === "string",
      )
      .sort((a, b) => a.t - b.t);

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (!segment) continue;

      const sampleId = `${scene.sceneId}:${segment.t}`;
      const contextSegments = segments.slice(Math.max(0, index - 2), index);
      const context =
        contextSegments.length > 0
          ? contextSegments.map(formatSegmentContext).join("\n")
          : undefined;

      const sceneConstraints = isRecord(scene.constraints)
        ? scene.constraints
        : {};
      const targetLang =
        typeof scene.langTgt === "string" ? scene.langTgt : undefined;
      const constraints = targetLang
        ? { ...sceneConstraints, targetLang }
        : sceneConstraints;

      const ja: DatasetSample["ja"] = { text: segment.text };
      if (context) {
        ja.context = context;
      }
      samples.push({ id: sampleId, ja, constraints });
      sampleMeta.set(sampleId, { sceneDbId: scene.id, segmentT: segment.t });
    }
  }

  return { samples, sampleMeta };
}

async function insertRunRecord(
  record: RunRecord,
  experimentId: string,
  meta: SampleMeta,
) {
  const insertValues: typeof schema.runs.$inferInsert = {
    id: nanoid(),
    experimentId,
    runId: record.runId,
    sceneId: meta.sceneDbId,
    condition: record.condition,
    segmentT: meta.segmentT,
    draftEn: record.draft.en,
    finalEn: record.final.en,
    issues: record.verifier.issues,
    hardChecks: record.verifier.hardChecks,
    scores: record.scores,
    usage: record.usage,
    timingMs: record.timingMs,
    state: record.state,
    status: record.status ?? "ok",
  };
  await db.insert(schema.runs).values(insertValues);
}

async function runExperiment(
  experiment: typeof schema.experiments.$inferSelect,
  config: LoadedConfig,
  conditions: Condition[],
  runId: string,
) {
  const filter = normalizeSceneFilter(experiment.sceneFilter);
  const scenes = await fetchScenes(filter);

  if (scenes.length === 0) {
    throw new ExperimentStartError("No scenes matched the experiment filter");
  }

  const { samples, sampleMeta } = buildDatasetSamples(scenes);

  if (samples.length === 0) {
    throw new ExperimentStartError("No segments available for this experiment");
  }

  let writeChain = Promise.resolve();
  const moduleUrl = new URL("../../../src/pipeline/runner.ts", import.meta.url);
  const module = (await import(moduleUrl.href)) as {
    PipelineRunner: new (init: {
      config: LoadedConfig;
      runId: string;
      conditions: Condition[];
      outputFile: string;
      dataset: DatasetSample[];
      onRecord?: (record: RunRecord) => Promise<void> | void;
    }) => { run: () => Promise<void> };
  };
  const runner = new module.PipelineRunner({
    config,
    runId,
    conditions,
    outputFile: path.join(resolveBaseDir(), "runs", `${runId}.jsonl`),
    dataset: samples,
    onRecord: (record) => {
      const meta = sampleMeta.get(record.id);
      if (!meta) return;
      writeChain = writeChain.then(() =>
        insertRunRecord(record, experiment.id, meta),
      );
      return writeChain;
    },
  });

  await runner.run();
}

export async function startExperimentRun(
  experiment: typeof schema.experiments.$inferSelect,
) {
  if (experiment.status === "running") {
    throw new ExperimentStartError("Experiment is already running");
  }
  if (experiment.status !== "draft") {
    throw new ExperimentStartError(
      `Experiment status must be draft (current: ${experiment.status})`,
    );
  }

  const conditions = normalizeConditions(experiment.conditions);
  if (conditions.length === 0) {
    throw new ExperimentStartError("Experiment has no valid conditions");
  }

  const config = await loadExperimentConfig(experiment.config);
  const runId = `exp-${experiment.id}-${new Date()
    .toISOString()
    .replace(/[:.]/g, "")}-${nanoid(6)}`;

  await db
    .update(schema.experiments)
    .set({ status: "running", updatedAt: new Date().toISOString() })
    .where(eq(schema.experiments.id, experiment.id));

  void (async () => {
    try {
      await runExperiment(experiment, config, conditions, runId);
      await db
        .update(schema.experiments)
        .set({ status: "completed", updatedAt: new Date().toISOString() })
        .where(eq(schema.experiments.id, experiment.id));
    } catch (err) {
      console.error("Experiment run failed:", err);
      await db
        .update(schema.experiments)
        .set({ status: "failed", updatedAt: new Date().toISOString() })
        .where(eq(schema.experiments.id, experiment.id));
    }
  })();

  return { runId };
}

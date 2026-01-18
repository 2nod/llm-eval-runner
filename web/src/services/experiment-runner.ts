import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db, schema } from "../db/client";

interface SceneFilter {
  split?: "train" | "dev" | "test";
  tags?: string[];
  sceneIds?: string[];
}

interface SegmentLike {
  t: number;
  text: string;
  type?: string;
  speaker?: string;
}

interface SampleMeta {
  sceneDbId: string;
  segmentT: number;
}

const conditionOrder = ["A0", "A1", "A2", "A3"] as const;
type Condition = (typeof conditionOrder)[number];

interface DatasetSample {
  id: string;
  ja: {
    text: string;
    context?: string;
  };
  constraints?: Record<string, unknown>;
}

interface RunRecord {
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
}

interface LoadedConfig extends Record<string, unknown> {
  baseDir: string;
}

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

const resolveBaseDir = () =>
  process.env["EXPERIMENT_BASE_DIR"] ?? DEFAULT_BASE_DIR;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const parseSplit = (
  raw: Record<string, unknown>
): SceneFilter["split"] | undefined => {
  const value = raw["split"];
  if (value === "train" || value === "dev" || value === "test") {
    return value;
  }
  return undefined;
};

const parseStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const normalizeSceneFilter = (raw: unknown): SceneFilter => {
  if (!isRecord(raw)) {
    return {};
  }
  const split = parseSplit(raw);
  const sceneIds = parseStringArray(raw["sceneIds"]);
  const tags = parseStringArray(raw["tags"]);
  return {
    ...(sceneIds.length > 0 ? { sceneIds } : {}),
    ...(split ? { split } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  };
};

const normalizeConditions = (raw: unknown): Condition[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const requested = new Set(
    raw.filter((value): value is Condition => conditionOrder.includes(value))
  );
  return conditionOrder.filter((condition) => requested.has(condition));
};

const loadExperimentConfig = async (raw: unknown): Promise<LoadedConfig> => {
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
};

const fetchScenes = async (filter: SceneFilter) => {
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
};

const formatSegmentContext = (segment: SegmentLike) => {
  const typePrefix =
    typeof segment.type === "string" && segment.type !== "dialogue"
      ? `[${segment.type}] `
      : "";
  const speakerPrefix =
    typeof segment.speaker === "string" ? `${segment.speaker}: ` : "";
  return `${typePrefix}${speakerPrefix}${segment.text}`;
};

const normalizeSegments = (
  scene: typeof schema.scenes.$inferSelect
): SegmentLike[] => {
  const rawSegments = Array.isArray(scene.segments)
    ? (scene.segments as SegmentLike[])
    : [];
  return rawSegments
    .filter(
      (segment) =>
        segment &&
        typeof segment.t === "number" &&
        typeof segment.text === "string"
    )
    .toSorted((a, b) => a.t - b.t);
};

const buildContext = (segments: SegmentLike[], index: number) => {
  const contextSegments = segments.slice(Math.max(0, index - 2), index);
  if (contextSegments.length === 0) {
    return;
  }
  return contextSegments.map(formatSegmentContext).join("\n");
};

const buildConstraints = (scene: typeof schema.scenes.$inferSelect) => {
  const sceneConstraints = isRecord(scene.constraints) ? scene.constraints : {};
  const targetLang =
    typeof scene.langTgt === "string" ? scene.langTgt : undefined;
  if (targetLang) {
    return { ...sceneConstraints, targetLang };
  }
  return sceneConstraints;
};

const buildJa = (text: string, context?: string): DatasetSample["ja"] => {
  const ja: DatasetSample["ja"] = { text };
  if (context) {
    ja.context = context;
  }
  return ja;
};

const addSampleForSegment = (
  scene: typeof schema.scenes.$inferSelect,
  segment: SegmentLike,
  segments: SegmentLike[],
  index: number,
  samples: DatasetSample[],
  sampleMeta: Map<string, SampleMeta>
) => {
  const sampleId = `${scene.sceneId}:${segment.t}`;
  const context = buildContext(segments, index);
  const constraints = buildConstraints(scene);
  const ja = buildJa(segment.text, context);
  samples.push({ constraints, id: sampleId, ja });
  sampleMeta.set(sampleId, { sceneDbId: scene.id, segmentT: segment.t });
};

const addSceneSamples = (
  scene: typeof schema.scenes.$inferSelect,
  samples: DatasetSample[],
  sampleMeta: Map<string, SampleMeta>
) => {
  const segments = normalizeSegments(scene);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment) {
      addSampleForSegment(scene, segment, segments, index, samples, sampleMeta);
    }
  }
};

const buildDatasetSamples = (scenes: (typeof schema.scenes.$inferSelect)[]) => {
  const samples: DatasetSample[] = [];
  const sampleMeta = new Map<string, SampleMeta>();

  for (const scene of scenes) {
    addSceneSamples(scene, samples, sampleMeta);
  }

  return { sampleMeta, samples };
};

const insertRunRecord = async (
  record: RunRecord,
  experimentId: string,
  meta: SampleMeta
) => {
  const insertValues: typeof schema.runs.$inferInsert = {
    condition: record.condition,
    draftEn: record.draft.en,
    experimentId,
    finalEn: record.final.en,
    hardChecks: record.verifier.hardChecks,
    id: nanoid(),
    issues: record.verifier.issues,
    runId: record.runId,
    sceneId: meta.sceneDbId,
    scores: record.scores,
    segmentT: meta.segmentT,
    state: record.state,
    status: record.status ?? "ok",
    timingMs: record.timingMs,
    usage: record.usage,
  };
  await db.insert(schema.runs).values(insertValues);
};

const createRecordWriter = (
  experimentId: string,
  sampleMeta: Map<string, SampleMeta>
) => {
  let writeChain: Promise<void> | undefined;

  return async (record: RunRecord) => {
    const meta = sampleMeta.get(record.id);
    if (!meta) {
      return;
    }
    const nextWrite = (async () => {
      if (writeChain) {
        await writeChain;
      }
      await insertRunRecord(record, experimentId, meta);
    })();
    writeChain = nextWrite;
    await nextWrite;
  };
};

const ensureSamples = (scenes: (typeof schema.scenes.$inferSelect)[]) => {
  if (scenes.length === 0) {
    throw new ExperimentStartError("No scenes matched the experiment filter");
  }

  const { samples, sampleMeta } = buildDatasetSamples(scenes);

  if (samples.length === 0) {
    throw new ExperimentStartError("No segments available for this experiment");
  }

  return { sampleMeta, samples };
};

const loadPipelineRunner = async () => {
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
  return module.PipelineRunner;
};

const createPipelineRunner = async (
  experimentId: string,
  config: LoadedConfig,
  conditions: Condition[],
  runId: string,
  samples: DatasetSample[],
  sampleMeta: Map<string, SampleMeta>
) => {
  const PipelineRunner = await loadPipelineRunner();
  return new PipelineRunner({
    conditions,
    config,
    dataset: samples,
    onRecord: createRecordWriter(experimentId, sampleMeta),
    outputFile: path.join(resolveBaseDir(), "runs", `${runId}.jsonl`),
    runId,
  });
};

const runExperiment = async (
  experiment: typeof schema.experiments.$inferSelect,
  config: LoadedConfig,
  conditions: Condition[],
  runId: string
) => {
  const scenes = await fetchScenes(
    normalizeSceneFilter(experiment.sceneFilter)
  );
  const { samples, sampleMeta } = ensureSamples(scenes);
  const runner = await createPipelineRunner(
    experiment.id,
    config,
    conditions,
    runId,
    samples,
    sampleMeta
  );
  await runner.run();
};

const runExperimentInBackground = async (
  experiment: typeof schema.experiments.$inferSelect,
  config: LoadedConfig,
  conditions: Condition[],
  runId: string
) => {
  try {
    await runExperiment(experiment, config, conditions, runId);
  } catch (error) {
    console.error("Experiment run failed:", error);
  }
};

const ensureStartable = (
  experiment: typeof schema.experiments.$inferSelect
) => {
  if (experiment.status === "running") {
    throw new ExperimentStartError("Experiment is already running");
  }
  if (experiment.status !== "draft") {
    throw new ExperimentStartError(
      `Experiment status must be draft (current: ${experiment.status})`
    );
  }
};

const buildRunId = (experimentId: string) =>
  `exp-${experimentId}-${new Date()
    .toISOString()
    .replaceAll(/[:.]/g, "")}-${nanoid(6)}`;

const markExperimentRunning = async (experimentId: string) => {
  await db
    .update(schema.experiments)
    .set({ status: "running", updatedAt: new Date().toISOString() })
    .where(eq(schema.experiments.id, experimentId));
};

export const startExperimentRun = async (
  experiment: typeof schema.experiments.$inferSelect
) => {
  ensureStartable(experiment);

  const conditions = normalizeConditions(experiment.conditions);
  if (conditions.length === 0) {
    throw new ExperimentStartError("Experiment has no valid conditions");
  }

  const config = await loadExperimentConfig(experiment.config);
  const runId = buildRunId(experiment.id);

  await markExperimentRunning(experiment.id);
  runExperimentInBackground(experiment, config, conditions, runId);

  return { runId };
};

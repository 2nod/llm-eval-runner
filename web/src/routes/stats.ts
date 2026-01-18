import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { db, schema } from "../db/client";

const statsRoutes = new Hono();

interface ConditionStatsEntry {
  avgScore: number;
  errorCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  totalRuns: number;
}

interface ComparisonEntry {
  avgAdequacy: number;
  avgConstraintCompliance: number;
  avgFluency: number;
  avgOverall: number;
  condition: string;
  fatalErrorRate: number;
  totalRuns: number;
}

const buildScenesBySplit = (
  splitCounts: { count: number; split: string | null }[]
) => {
  const scenesBySplit: Record<string, number> = {};
  for (const row of splitCounts) {
    if (row.split) {
      scenesBySplit[row.split] = row.count;
    }
  }
  return scenesBySplit;
};

const fetchExperiment = async (id: string) => {
  const [experiment] = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .limit(1);
  return experiment ?? null;
};

const fetchRunsForExperiment = (id: string) =>
  db.select().from(schema.runs).where(eq(schema.runs.experimentId, id));

const createConditionStatsEntry = (): ConditionStatsEntry => ({
  avgScore: 0,
  errorCounts: { CONS: 0, FB: 0, IMPL: 0, KL: 0, LEX: 0, REF: 0 },
  statusCounts: { error: 0, needs_review: 0, ok: 0 },
  totalRuns: 0,
});

const getOverallScore = (run: typeof schema.runs.$inferSelect) => {
  const scores = run.scores as Record<string, unknown> | null;
  if (scores && typeof scores["overall"] === "number") {
    return scores["overall"];
  }
  return null;
};

const getIssues = (run: typeof schema.runs.$inferSelect) => {
  const issues = run.issues as { type?: string }[] | null;
  return Array.isArray(issues) ? issues : [];
};

const updateErrorCounts = (
  errorCounts: Record<string, number>,
  issues: { type?: string }[]
) => {
  for (const issue of issues) {
    if (issue.type && issue.type in errorCounts) {
      errorCounts[issue.type] = (errorCounts[issue.type] ?? 0) + 1;
    }
  }
};

const updateConditionStats = (
  stats: ConditionStatsEntry,
  run: typeof schema.runs.$inferSelect
) => {
  stats.totalRuns += 1;

  if (run.status) {
    stats.statusCounts[run.status] = (stats.statusCounts[run.status] ?? 0) + 1;
  }

  const overallScore = getOverallScore(run);
  if (overallScore !== null) {
    stats.avgScore += overallScore;
  }

  updateErrorCounts(stats.errorCounts, getIssues(run));
};

const finalizeConditionStats = (
  conditionStats: Record<string, ConditionStatsEntry>
) => {
  for (const stats of Object.values(conditionStats)) {
    if (stats.totalRuns > 0) {
      stats.avgScore /= stats.totalRuns;
    }
  }
};

const buildConditionStats = (runs: (typeof schema.runs.$inferSelect)[]) => {
  const conditionStats: Record<string, ConditionStatsEntry> = {};
  for (const run of runs) {
    const { condition } = run;
    if (!conditionStats[condition]) {
      conditionStats[condition] = createConditionStatsEntry();
    }
    const stats = conditionStats[condition];
    if (stats) {
      updateConditionStats(stats, run);
    }
  }
  finalizeConditionStats(conditionStats);
  return conditionStats;
};

const createErrorTypeStats = () => ({
  fatal: 0,
  major: 0,
  minor: 0,
  total: 0,
});

const ensureErrorTypeStats = (
  byType: Record<string, Record<string, number>>,
  errorType: string
) => {
  if (!byType[errorType]) {
    byType[errorType] = createErrorTypeStats();
  }
  return byType[errorType];
};

const updateErrorTypeStats = (
  typeStats: Record<string, number>,
  row: { count: number; severity: string | null }
) => {
  if (!row.severity) {
    return;
  }
  typeStats[row.severity] = row.count;
  typeStats.total = (typeStats.total ?? 0) + row.count;
};

const buildErrorTypeSummary = (
  errorTypeCounts: {
    count: number;
    errorType: string | null;
    severity: string | null;
  }[]
) => {
  const byType: Record<string, Record<string, number>> = {};
  let total = 0;

  for (const row of errorTypeCounts) {
    if (!row.errorType) {
      continue;
    }
    const typeStats = ensureErrorTypeStats(byType, row.errorType);
    updateErrorTypeStats(typeStats, row);
    total += row.count;
  }

  return { byType, total };
};

const createComparisonEntry = (condition: string): ComparisonEntry => ({
  avgAdequacy: 0,
  avgConstraintCompliance: 0,
  avgFluency: 0,
  avgOverall: 0,
  condition,
  fatalErrorRate: 0,
  totalRuns: 0,
});

const getJudgeScores = (run: typeof schema.runs.$inferSelect) => {
  const scores = run.scores as Record<string, unknown> | null;
  if (!scores) {
    return null;
  }
  return (scores["judge"] as Record<string, number> | undefined) ?? null;
};

const updateComparisonEntry = (
  stats: ComparisonEntry,
  run: typeof schema.runs.$inferSelect
) => {
  stats.totalRuns += 1;

  const judge = getJudgeScores(run);
  if (judge) {
    stats.avgOverall += judge["overall"] ?? 0;
    stats.avgAdequacy += judge["adequacy"] ?? 0;
    stats.avgFluency += judge["fluency"] ?? 0;
    stats.avgConstraintCompliance += judge["constraintCompliance"] ?? 0;
  }

  if (run.status === "needs_review" || run.status === "error") {
    stats.fatalErrorRate += 1;
  }
};

const finalizeComparisonStats = (
  comparison: Record<string, ComparisonEntry>
) => {
  for (const stats of Object.values(comparison)) {
    if (stats.totalRuns > 0) {
      stats.avgOverall /= stats.totalRuns;
      stats.avgAdequacy /= stats.totalRuns;
      stats.avgFluency /= stats.totalRuns;
      stats.avgConstraintCompliance /= stats.totalRuns;
      stats.fatalErrorRate /= stats.totalRuns;
    }
  }
};

const buildComparisonStats = (runs: (typeof schema.runs.$inferSelect)[]) => {
  const comparison: Record<string, ComparisonEntry> = {};
  for (const run of runs) {
    const { condition } = run;
    if (!comparison[condition]) {
      comparison[condition] = createComparisonEntry(condition);
    }
    const stats = comparison[condition];
    if (stats) {
      updateComparisonEntry(stats, run);
    }
  }
  finalizeComparisonStats(comparison);
  return Object.values(comparison);
};

statsRoutes.get("/overview", async (c) => {
  const scenesCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.scenes);

  const experimentsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.experiments);

  const runsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.runs);

  const annotationsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.annotations);

  const splitCounts = await db
    .select({
      count: sql<number>`count(*)`,
      split: schema.scenes.split,
    })
    .from(schema.scenes)
    .groupBy(schema.scenes.split);
  const scenesBySplit = buildScenesBySplit(splitCounts);

  return c.json({
    data: {
      scenesBySplit,
      totalAnnotations: annotationsCount[0]?.count ?? 0,
      totalExperiments: experimentsCount[0]?.count ?? 0,
      totalRuns: runsCount[0]?.count ?? 0,
      totalScenes: scenesCount[0]?.count ?? 0,
    },
  });
});

statsRoutes.get("/experiment/:id", async (c) => {
  const id = c.req.param("id");

  const experiment = await fetchExperiment(id);
  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  const runs = await fetchRunsForExperiment(id);
  const conditionStats = buildConditionStats(runs);

  return c.json({
    data: {
      conditionStats,
      experiment,
      totalRuns: runs.length,
    },
  });
});

statsRoutes.get("/errors", async (c) => {
  const experimentId = c.req.query("experimentId");

  const errorTypeCounts = await db
    .select({
      count: sql<number>`count(*)`,
      errorType: schema.annotations.errorType,
      severity: schema.annotations.severity,
    })
    .from(schema.annotations)
    .where(
      experimentId ? eq(schema.annotations.runId, experimentId) : undefined
    )
    .groupBy(schema.annotations.errorType, schema.annotations.severity);
  const { byType, total } = buildErrorTypeSummary(errorTypeCounts);

  return c.json({
    data: {
      byErrorType: byType,
      total,
    },
  });
});

statsRoutes.get("/compare", async (c) => {
  const experimentId = c.req.query("experimentId");

  if (!experimentId) {
    return c.json({ error: "experimentId is required" }, 400);
  }

  const runs = await fetchRunsForExperiment(experimentId);
  const data = buildComparisonStats(runs);

  return c.json({
    data,
  });
});

export { statsRoutes };

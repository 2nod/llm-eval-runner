import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client";

const statsRoutes = new Hono();

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
      split: schema.scenes.split,
      count: sql<number>`count(*)`,
    })
    .from(schema.scenes)
    .groupBy(schema.scenes.split);

  return c.json({
    data: {
      totalScenes: scenesCount[0]?.count ?? 0,
      totalExperiments: experimentsCount[0]?.count ?? 0,
      totalRuns: runsCount[0]?.count ?? 0,
      totalAnnotations: annotationsCount[0]?.count ?? 0,
      scenesBySplit: splitCounts.reduce(
        (acc, row) => {
          if (row.split) {
            acc[row.split] = row.count;
          }
          return acc;
        },
        {} as Record<string, number>,
      ),
    },
  });
});

statsRoutes.get("/experiment/:id", async (c) => {
  const id = c.req.param("id");

  const experiment = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .limit(1);

  if (experiment.length === 0) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  const runs = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.experimentId, id));

  const conditionStats: Record<
    string,
    {
      totalRuns: number;
      avgScore: number;
      errorCounts: Record<string, number>;
      statusCounts: Record<string, number>;
    }
  > = {};

  for (const run of runs) {
    const condition = run.condition;
    if (!conditionStats[condition]) {
      conditionStats[condition] = {
        totalRuns: 0,
        avgScore: 0,
        errorCounts: { KL: 0, FB: 0, REF: 0, IMPL: 0, LEX: 0, CONS: 0 },
        statusCounts: { ok: 0, needs_review: 0, error: 0 },
      };
    }

    const stats = conditionStats[condition];
    if (!stats) continue;

    stats.totalRuns++;

    if (run.status) {
      stats.statusCounts[run.status] =
        (stats.statusCounts[run.status] ?? 0) + 1;
    }

    const scores = run.scores as Record<string, unknown> | null;
    if (scores && typeof scores["overall"] === "number") {
      stats.avgScore += scores["overall"];
    }

    const issues = run.issues as Array<{ type?: string }> | null;
    if (issues && Array.isArray(issues)) {
      for (const issue of issues) {
        if (issue.type && issue.type in stats.errorCounts) {
          stats.errorCounts[issue.type] =
            (stats.errorCounts[issue.type] ?? 0) + 1;
        }
      }
    }
  }

  for (const condition of Object.keys(conditionStats)) {
    const stats = conditionStats[condition];
    if (stats && stats.totalRuns > 0) {
      stats.avgScore = stats.avgScore / stats.totalRuns;
    }
  }

  return c.json({
    data: {
      experiment: experiment[0],
      conditionStats,
      totalRuns: runs.length,
    },
  });
});

statsRoutes.get("/errors", async (c) => {
  const experimentId = c.req.query("experimentId");

  const conditions = [];
  if (experimentId) {
    conditions.push(eq(schema.annotations.runId, experimentId));
  }

  const errorTypeCounts = await db
    .select({
      errorType: schema.annotations.errorType,
      severity: schema.annotations.severity,
      count: sql<number>`count(*)`,
    })
    .from(schema.annotations)
    .groupBy(schema.annotations.errorType, schema.annotations.severity);

  const byType: Record<string, Record<string, number>> = {};
  for (const row of errorTypeCounts) {
    if (!row.errorType) continue;
    if (!byType[row.errorType]) {
      byType[row.errorType] = { fatal: 0, major: 0, minor: 0, total: 0 };
    }
    const typeStats = byType[row.errorType];
    if (typeStats && row.severity) {
      typeStats[row.severity] = row.count;
      typeStats["total"] = (typeStats["total"] ?? 0) + row.count;
    }
  }

  return c.json({
    data: {
      byErrorType: byType,
      total: errorTypeCounts.reduce((sum, row) => sum + row.count, 0),
    },
  });
});

statsRoutes.get("/compare", async (c) => {
  const experimentId = c.req.query("experimentId");

  if (!experimentId) {
    return c.json({ error: "experimentId is required" }, 400);
  }

  const runs = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.experimentId, experimentId));

  const comparison: Record<
    string,
    {
      condition: string;
      avgOverall: number;
      avgAdequacy: number;
      avgFluency: number;
      avgConstraintCompliance: number;
      fatalErrorRate: number;
      totalRuns: number;
    }
  > = {};

  for (const run of runs) {
    const condition = run.condition;
    if (!comparison[condition]) {
      comparison[condition] = {
        condition,
        avgOverall: 0,
        avgAdequacy: 0,
        avgFluency: 0,
        avgConstraintCompliance: 0,
        fatalErrorRate: 0,
        totalRuns: 0,
      };
    }

    const stats = comparison[condition];
    if (!stats) continue;

    stats.totalRuns++;

    const scores = run.scores as Record<string, unknown> | null;
    if (scores) {
      const judge = scores["judge"] as Record<string, number> | undefined;
      if (judge) {
        stats.avgOverall += judge["overall"] ?? 0;
        stats.avgAdequacy += judge["adequacy"] ?? 0;
        stats.avgFluency += judge["fluency"] ?? 0;
        stats.avgConstraintCompliance += judge["constraintCompliance"] ?? 0;
      }
    }

    if (run.status === "needs_review" || run.status === "error") {
      stats.fatalErrorRate++;
    }
  }

  for (const condition of Object.keys(comparison)) {
    const stats = comparison[condition];
    if (stats && stats.totalRuns > 0) {
      stats.avgOverall /= stats.totalRuns;
      stats.avgAdequacy /= stats.totalRuns;
      stats.avgFluency /= stats.totalRuns;
      stats.avgConstraintCompliance /= stats.totalRuns;
      stats.fatalErrorRate /= stats.totalRuns;
    }
  }

  return c.json({
    data: Object.values(comparison),
  });
});

export { statsRoutes };

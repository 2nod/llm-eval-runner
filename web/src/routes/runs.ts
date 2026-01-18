import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";

import { db, schema } from "../db/client";

const runsRoutes = new Hono();

const listQuerySchema = z.object({
  condition: z.enum(["A0", "A1", "A2", "A3"]).optional(),
  experimentId: z.string().optional(),
  limit: z.coerce.number().int().positive().default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
  sceneId: z.string().optional(),
  status: z.enum(["ok", "needs_review", "error"]).optional(),
});

const createRunSchema = z.object({
  condition: z.enum(["A0", "A1", "A2", "A3"]),
  draftEn: z.string().optional(),
  experimentId: z.string().optional(),
  finalEn: z.string().optional(),
  hardChecks: z.array(z.unknown()).optional(),
  issues: z.array(z.unknown()).optional(),
  runId: z.string(),
  sceneId: z.string(),
  scores: z.record(z.string(), z.unknown()).optional(),
  segmentT: z.number().int().optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["ok", "needs_review", "error"]).optional(),
  timingMs: z.record(z.string(), z.unknown()).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
});

const buildRunConditions = (query: z.infer<typeof listQuerySchema>) => {
  const conditions = [];

  if (query.experimentId) {
    conditions.push(eq(schema.runs.experimentId, query.experimentId));
  }
  if (query.sceneId) {
    conditions.push(eq(schema.runs.sceneId, query.sceneId));
  }
  if (query.condition) {
    conditions.push(eq(schema.runs.condition, query.condition));
  }
  if (query.status) {
    conditions.push(eq(schema.runs.status, query.status));
  }

  return conditions;
};

const fetchRunsList = async (query: z.infer<typeof listQuerySchema>) => {
  const conditions = buildRunConditions(query);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(schema.runs)
    .where(whereClause)
    .orderBy(desc(schema.runs.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.runs)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  return { results, total };
};

const insertRunRecord = async (
  run: z.infer<typeof createRunSchema>,
  id: string
) => {
  await db.insert(schema.runs).values({
    condition: run.condition,
    draftEn: run.draftEn,
    experimentId: run.experimentId,
    finalEn: run.finalEn,
    hardChecks: run.hardChecks,
    id,
    issues: run.issues,
    runId: run.runId,
    sceneId: run.sceneId,
    scores: run.scores,
    segmentT: run.segmentT,
    state: run.state,
    status: run.status,
    timingMs: run.timingMs,
    usage: run.usage,
  });
};

const createBulkResults = () => ({
  errors: [] as { error: string; index: number }[],
  imported: 0,
});

const importRunWithIndex = async (
  run: z.infer<typeof createRunSchema> | undefined,
  index: number,
  results: ReturnType<typeof createBulkResults>
) => {
  if (!run) {
    return;
  }

  try {
    const id = nanoid();
    await insertRunRecord(run, id);
    results.imported += 1;
  } catch (error) {
    results.errors.push({
      error: error instanceof Error ? error.message : "Unknown error",
      index,
    });
  }
};

const importRuns = async (runs: z.infer<typeof createRunSchema>[]) => {
  const results = createBulkResults();

  for (const [index, run] of runs.entries()) {
    await importRunWithIndex(run, index, results);
  }

  return results;
};

const fetchRunById = async (id: string) => {
  const [run] = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, id))
    .limit(1);

  return run ?? null;
};

const fetchRelatedRuns = (currentRun: typeof schema.runs.$inferSelect) =>
  db
    .select()
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.sceneId, currentRun.sceneId),
        eq(schema.runs.runId, currentRun.runId)
      )
    );

const buildByCondition = (runs: (typeof schema.runs.$inferSelect)[]) => {
  const byCondition: Record<string, typeof schema.runs.$inferSelect> = {};
  for (const run of runs) {
    byCondition[run.condition] = run;
  }
  return byCondition;
};

runsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const { results, total } = await fetchRunsList(query);

  return c.json({
    data: results,
    pagination: {
      hasMore: query.offset + results.length < total,
      limit: query.limit,
      offset: query.offset,
      total,
    },
  });
});

runsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json({ data: result[0] });
});

runsRoutes.post("/", zValidator("json", createRunSchema), async (c) => {
  const body = c.req.valid("json");
  const id = nanoid();

  await insertRunRecord(body, id);

  const result = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, id))
    .limit(1);

  return c.json({ data: result[0] }, 201);
});

runsRoutes.post("/bulk", async (c) => {
  const body = await c.req.json<{ runs: z.infer<typeof createRunSchema>[] }>();

  if (!body.runs || !Array.isArray(body.runs)) {
    return c.json({ error: "runs array is required" }, 400);
  }

  const results = await importRuns(body.runs);

  return c.json({ data: results });
});

runsRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "Run not found" }, 404);
  }

  await db.delete(schema.annotations).where(eq(schema.annotations.runId, id));
  await db.delete(schema.runs).where(eq(schema.runs.id, id));

  return c.json({ success: true });
});

runsRoutes.get("/:id/compare", async (c) => {
  const id = c.req.param("id");
  const currentRun = await fetchRunById(id);
  if (!currentRun) {
    return c.json({ error: "Run not found" }, 404);
  }

  if (!currentRun.sceneId) {
    return c.json({
      data: {
        byCondition: { [currentRun.condition]: currentRun },
        current: currentRun,
      },
    });
  }

  const relatedRuns = await fetchRelatedRuns(currentRun);

  return c.json({
    data: {
      byCondition: buildByCondition(relatedRuns),
      current: currentRun,
    },
  });
});

export { runsRoutes };

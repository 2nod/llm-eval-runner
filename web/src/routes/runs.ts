import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client";

const runsRoutes = new Hono();

const listQuerySchema = z.object({
  experimentId: z.string().optional(),
  sceneId: z.string().optional(),
  condition: z.enum(["A0", "A1", "A2", "A3"]).optional(),
  status: z.enum(["ok", "needs_review", "error"]).optional(),
  limit: z.coerce.number().int().positive().default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const createRunSchema = z.object({
  experimentId: z.string().optional(),
  runId: z.string(),
  sceneId: z.string(),
  condition: z.enum(["A0", "A1", "A2", "A3"]),
  segmentT: z.number().int().optional(),
  draftEn: z.string().optional(),
  finalEn: z.string().optional(),
  issues: z.array(z.unknown()).optional(),
  hardChecks: z.array(z.unknown()).optional(),
  scores: z.record(z.string(), z.unknown()).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  timingMs: z.record(z.string(), z.unknown()).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["ok", "needs_review", "error"]).optional(),
});

runsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query");

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

  const results = await db
    .select()
    .from(schema.runs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.runs.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.runs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = countResult[0]?.count ?? 0;

  return c.json({
    data: results,
    pagination: {
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + results.length < total,
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

  await db.insert(schema.runs).values({
    id,
    experimentId: body.experimentId,
    runId: body.runId,
    sceneId: body.sceneId,
    condition: body.condition,
    segmentT: body.segmentT,
    draftEn: body.draftEn,
    finalEn: body.finalEn,
    issues: body.issues,
    hardChecks: body.hardChecks,
    scores: body.scores,
    usage: body.usage,
    timingMs: body.timingMs,
    state: body.state,
    status: body.status,
  });

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

  const results = {
    imported: 0,
    errors: [] as Array<{ index: number; error: string }>,
  };

  for (let i = 0; i < body.runs.length; i++) {
    const run = body.runs[i];
    if (!run) continue;

    try {
      const id = nanoid();
      await db.insert(schema.runs).values({
        id,
        experimentId: run.experimentId,
        runId: run.runId,
        sceneId: run.sceneId,
        condition: run.condition,
        segmentT: run.segmentT,
        draftEn: run.draftEn,
        finalEn: run.finalEn,
        issues: run.issues,
        hardChecks: run.hardChecks,
        scores: run.scores,
        usage: run.usage,
        timingMs: run.timingMs,
        state: run.state,
        status: run.status,
      });
      results.imported++;
    } catch (err) {
      results.errors.push({
        index: i,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

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

  const run = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, id))
    .limit(1);

  if (run.length === 0) {
    return c.json({ error: "Run not found" }, 404);
  }

  const currentRun = run[0];
  if (!currentRun) {
    return c.json({ error: "Run not found" }, 404);
  }

  if (!currentRun.sceneId) {
    return c.json({
      data: {
        current: currentRun,
        byCondition: { [currentRun.condition]: currentRun },
      },
    });
  }

  const relatedRuns = await db
    .select()
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.sceneId, currentRun.sceneId),
        eq(schema.runs.runId, currentRun.runId),
      ),
    );

  return c.json({
    data: {
      current: currentRun,
      byCondition: relatedRuns.reduce(
        (acc, r) => {
          acc[r.condition] = r;
          return acc;
        },
        {} as Record<string, (typeof relatedRuns)[0]>,
      ),
    },
  });
});

export { runsRoutes };

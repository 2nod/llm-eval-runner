import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client";
import {
  ExperimentStartError,
  startExperimentRun,
} from "../services/experimentRunner";

const experimentsRoutes = new Hono();

const createExperimentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()),
  conditions: z.array(z.enum(["A0", "A1", "A2", "A3"])).min(1),
  sceneFilter: z
    .object({
      split: z.enum(["train", "dev", "test"]).optional(),
      tags: z.array(z.string()).optional(),
      sceneIds: z.array(z.string()).optional(),
    })
    .optional(),
});

const updateExperimentSchema = createExperimentSchema.partial().extend({
  status: z.enum(["draft", "running", "completed", "failed"]).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["draft", "running", "completed", "failed"]).optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

experimentsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query");

  const conditions = [];
  if (query.status) {
    conditions.push(eq(schema.experiments.status, query.status));
  }

  const results = await db
    .select()
    .from(schema.experiments)
    .where(
      conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined,
    )
    .orderBy(desc(schema.experiments.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.experiments)
    .where(
      conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined,
    );

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

experimentsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  return c.json({ data: result[0] });
});

experimentsRoutes.post(
  "/",
  zValidator("json", createExperimentSchema),
  async (c) => {
    const body = c.req.valid("json");
    const id = nanoid();

    await db.insert(schema.experiments).values({
      id,
      name: body.name,
      description: body.description,
      config: body.config,
      conditions: body.conditions,
      sceneFilter: body.sceneFilter,
      status: "draft",
    });

    const result = await db
      .select()
      .from(schema.experiments)
      .where(eq(schema.experiments.id, id))
      .limit(1);

    return c.json({ data: result[0] }, 201);
  },
);

experimentsRoutes.put(
  "/:id",
  zValidator("json", updateExperimentSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await db
      .select()
      .from(schema.experiments)
      .where(eq(schema.experiments.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Experiment not found" }, 404);
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData["name"] = body.name;
    if (body.description !== undefined)
      updateData["description"] = body.description;
    if (body.config !== undefined) updateData["config"] = body.config;
    if (body.conditions !== undefined)
      updateData["conditions"] = body.conditions;
    if (body.sceneFilter !== undefined)
      updateData["sceneFilter"] = body.sceneFilter;
    if (body.status !== undefined) updateData["status"] = body.status;

    await db
      .update(schema.experiments)
      .set(updateData)
      .where(eq(schema.experiments.id, id));

    const result = await db
      .select()
      .from(schema.experiments)
      .where(eq(schema.experiments.id, id))
      .limit(1);

    return c.json({ data: result[0] });
  },
);

experimentsRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  await db.delete(schema.runs).where(eq(schema.runs.experimentId, id));
  await db.delete(schema.experiments).where(eq(schema.experiments.id, id));

  return c.json({ success: true });
});

experimentsRoutes.post("/:id/start", async (c) => {
  const id = c.req.param("id");

  const existing = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  const experiment = existing[0];
  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  if (experiment.status === "running") {
    return c.json({ error: "Experiment is already running" }, 400);
  }

  try {
    const { runId } = await startExperimentRun(experiment);
    return c.json(
      {
        message: "Experiment started",
        data: { id, status: "running", runId },
      },
      202,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start experiment";
    if (err instanceof ExperimentStartError) {
      return c.json({ error: message }, err.status);
    }
    console.error("Failed to start experiment:", err);
    return c.json({ error: message }, 500);
  }
});

experimentsRoutes.get("/:id/results", async (c) => {
  const id = c.req.param("id");

  const existing = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  const runs = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.experimentId, id));

  const aggregated = await db
    .select()
    .from(schema.aggregatedResults)
    .where(eq(schema.aggregatedResults.experimentId, id));

  const sceneIds = Array.from(
    new Set(
      runs
        .map((run) => run.sceneId)
        .filter((sceneId): sceneId is string => typeof sceneId === "string"),
    ),
  );

  const scenes =
    sceneIds.length > 0
      ? await db
          .select()
          .from(schema.scenes)
          .where(inArray(schema.scenes.id, sceneIds))
      : [];

  return c.json({
    data: {
      experiment: existing[0],
      runs,
      aggregated,
      scenes,
    },
  });
});

export { experimentsRoutes };

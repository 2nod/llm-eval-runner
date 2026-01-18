import { zValidator } from "@hono/zod-validator";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";

import { db, schema } from "../db/client";
import {
  ExperimentStartError,
  startExperimentRun,
} from "../services/experiment-runner";

const experimentsRoutes = new Hono();

const createExperimentSchema = z.object({
  conditions: z.array(z.enum(["A0", "A1", "A2", "A3"])).min(1),
  config: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
  name: z.string().min(1),
  sceneFilter: z
    .object({
      sceneIds: z.array(z.string()).optional(),
      split: z.enum(["train", "dev", "test"]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

const updateExperimentSchema = createExperimentSchema.partial().extend({
  status: z.enum(["draft", "running", "completed", "failed"]).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  status: z.enum(["draft", "running", "completed", "failed"]).optional(),
});

const fetchExperimentById = async (id: string) => {
  const [experiment] = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .limit(1);
  return experiment ?? null;
};

const assignIfDefined = (
  target: Record<string, unknown>,
  key: string,
  value: unknown
) => {
  if (value === undefined) {
    return;
  }
  target[key] = value;
};

const buildExperimentUpdateData = (
  body: z.infer<typeof updateExperimentSchema>
) => {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  assignIfDefined(updateData, "config", body.config);
  assignIfDefined(updateData, "conditions", body.conditions);
  assignIfDefined(updateData, "description", body.description);
  assignIfDefined(updateData, "name", body.name);
  assignIfDefined(updateData, "sceneFilter", body.sceneFilter);
  assignIfDefined(updateData, "status", body.status);
  return updateData;
};

const updateExperiment = async (
  id: string,
  body: z.infer<typeof updateExperimentSchema>
) => {
  const updateData = buildExperimentUpdateData(body);
  await db
    .update(schema.experiments)
    .set(updateData)
    .where(eq(schema.experiments.id, id));
  return fetchExperimentById(id);
};

const formatStartExperimentError = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Failed to start experiment";
  if (error instanceof ExperimentStartError) {
    return { response: { error: message }, status: error.status };
  }
  console.error("Failed to start experiment:", error);
  return { response: { error: message }, status: 500 };
};

const startExperimentWithResponse = async (
  experiment: typeof schema.experiments.$inferSelect,
  id: string
) => {
  try {
    const { runId } = await startExperimentRun(experiment);
    return {
      response: {
        data: { id, runId, status: "running" },
        message: "Experiment started",
      },
      status: 202,
    };
  } catch (error) {
    return formatStartExperimentError(error);
  }
};

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
        : undefined
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
        : undefined
    );

  const total = countResult[0]?.count ?? 0;

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
      conditions: body.conditions,
      config: body.config,
      description: body.description,
      id,
      name: body.name,
      sceneFilter: body.sceneFilter,
      status: "draft",
    });

    const result = await db
      .select()
      .from(schema.experiments)
      .where(eq(schema.experiments.id, id))
      .limit(1);

    return c.json({ data: result[0] }, 201);
  }
);

experimentsRoutes.put(
  "/:id",
  zValidator("json", updateExperimentSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await fetchExperimentById(id);
    if (!existing) {
      return c.json({ error: "Experiment not found" }, 404);
    }

    const result = await updateExperiment(id, body);
    return c.json({ data: result });
  }
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

  const experiment = await fetchExperimentById(id);
  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  if (experiment.status === "running") {
    return c.json({ error: "Experiment is already running" }, 400);
  }

  const { response, status } = await startExperimentWithResponse(
    experiment,
    id
  );
  return c.json(response, status);
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

  const sceneIds = [
    ...new Set(
      runs
        .map((run) => run.sceneId)
        .filter((sceneId): sceneId is string => typeof sceneId === "string")
    ),
  ];

  const scenes =
    sceneIds.length > 0
      ? await db
          .select()
          .from(schema.scenes)
          .where(inArray(schema.scenes.id, sceneIds))
      : [];

  return c.json({
    data: {
      aggregated,
      experiment: existing[0],
      runs,
      scenes,
    },
  });
});

export { experimentsRoutes };

import { zValidator } from "@hono/zod-validator";
import { eq, like, inArray, sql, desc, asc } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";

import { db, schema } from "../db/client";
import { sceneSchema } from "../types/scene";

const scenesRoutes = new Hono();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
  sort: z.enum(["created_at", "updated_at", "scene_id"]).default("created_at"),
  split: z.enum(["train", "dev", "test"]).optional(),
  tags: z.string().optional(),
});

const createSceneSchema = sceneSchema.extend({
  split: z.enum(["train", "dev", "test"]).optional(),
  tags: z.array(z.string()).default([]),
});

const updateSceneSchema = createSceneSchema.partial();

const bulkImportSchema = z.object({
  defaultSplit: z.enum(["train", "dev", "test"]).optional(),
  scenes: z.array(createSceneSchema),
});

const pushIfDefined = <T>(conditions: T[], value: unknown, condition: T) => {
  if (value === undefined) {
    return;
  }
  conditions.push(condition);
};

const buildSceneConditions = (query: z.infer<typeof listQuerySchema>) => {
  const conditions = [];
  pushIfDefined(conditions, query.split, eq(schema.scenes.split, query.split));
  pushIfDefined(
    conditions,
    query.search,
    like(schema.scenes.sceneId, `%${query.search}%`)
  );
  return conditions;
};

const resolveOrderColumn = (sort: z.infer<typeof listQuerySchema>["sort"]) => {
  if (sort === "scene_id") {
    return schema.scenes.sceneId;
  }
  if (sort === "updated_at") {
    return schema.scenes.updatedAt;
  }
  return schema.scenes.createdAt;
};

const fetchScenesList = async (query: z.infer<typeof listQuerySchema>) => {
  const conditions = buildSceneConditions(query);
  const whereClause =
    conditions.length > 0
      ? sql`${sql.join(conditions, sql` AND `)}`
      : undefined;
  const orderColumn = resolveOrderColumn(query.sort);
  const orderFn = query.order === "asc" ? asc : desc;

  const results = await db
    .select()
    .from(schema.scenes)
    .where(whereClause)
    .orderBy(orderFn(orderColumn))
    .limit(query.limit)
    .offset(query.offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.scenes)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  return { results, total };
};

const fetchSceneById = async (id: string) => {
  const [scene] = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.id, id))
    .limit(1);
  return scene ?? null;
};

const insertSceneRecord = async (
  scene: z.infer<typeof createSceneSchema>,
  id: string,
  split: string | undefined
) => {
  await db.insert(schema.scenes).values({
    characterStates: scene.character_states,
    constraints: scene.constraints,
    evalTargets: scene.eval_targets,
    id,
    langSrc: scene.lang_src,
    langTgt: scene.lang_tgt,
    sceneId: scene.scene_id,
    segments: scene.segments,
    split,
    tags: scene.tags,
    worldState: scene.world_state,
  });
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

const buildSceneUpdateData = (body: z.infer<typeof updateSceneSchema>) => {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  const entries: [string, unknown][] = [
    ["sceneId", body.scene_id],
    ["langSrc", body.lang_src],
    ["langTgt", body.lang_tgt],
    ["segments", body.segments],
    ["worldState", body.world_state],
    ["characterStates", body.character_states],
    ["constraints", body.constraints],
    ["evalTargets", body.eval_targets],
    ["split", body.split],
    ["tags", body.tags],
  ];

  for (const [key, value] of entries) {
    assignIfDefined(updateData, key, value);
  }

  return updateData;
};

const updateScene = async (
  id: string,
  body: z.infer<typeof updateSceneSchema>
) => {
  const updateData = buildSceneUpdateData(body);
  await db
    .update(schema.scenes)
    .set(updateData)
    .where(eq(schema.scenes.id, id));
  return fetchSceneById(id);
};

const createBulkResults = () => ({
  errors: [] as { error: string; scene_id: string }[],
  imported: 0,
  skipped: 0,
});

type ImportSceneResult =
  | { status: "error"; error: string }
  | { status: "imported" }
  | { status: "skipped" };

const importSceneWithResult = async (
  scene: z.infer<typeof createSceneSchema>,
  defaultSplit: z.infer<typeof bulkImportSchema>["defaultSplit"]
): Promise<ImportSceneResult> => {
  const existing = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.sceneId, scene.scene_id))
    .limit(1);

  if (existing.length > 0) {
    return { status: "skipped" };
  }

  try {
    const id = nanoid();
    await insertSceneRecord(scene, id, scene.split ?? defaultSplit);
    return { status: "imported" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      status: "error",
    };
  }
};

const updateBulkResults = (
  results: ReturnType<typeof createBulkResults>,
  result: ImportSceneResult,
  sceneId: string
) => {
  switch (result.status) {
    case "imported": {
      results.imported += 1;
      break;
    }
    case "skipped": {
      results.skipped += 1;
      break;
    }
    case "error": {
      results.errors.push({ error: result.error, scene_id: sceneId });
      break;
    }
    default: {
      break;
    }
  }
};

const importScenes = async (
  scenes: z.infer<typeof createSceneSchema>[],
  defaultSplit: z.infer<typeof bulkImportSchema>["defaultSplit"]
) => {
  const results = createBulkResults();

  for (const scene of scenes) {
    const result = await importSceneWithResult(scene, defaultSplit);
    updateBulkResults(results, result, scene.scene_id);
  }

  return results;
};

scenesRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const { results, total } = await fetchScenesList(query);

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

scenesRoutes.get("/:id", async (c) => {
  const idOrSceneId = c.req.param("id");

  let result = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.id, idOrSceneId))
    .limit(1);

  if (result.length === 0) {
    result = await db
      .select()
      .from(schema.scenes)
      .where(eq(schema.scenes.sceneId, idOrSceneId))
      .limit(1);
  }

  if (result.length === 0) {
    return c.json({ error: "Scene not found" }, 404);
  }

  return c.json({ data: result[0] });
});

scenesRoutes.get("/by-scene-id/:sceneId", async (c) => {
  const sceneId = c.req.param("sceneId");

  const result = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.sceneId, sceneId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Scene not found" }, 404);
  }

  return c.json({ data: result[0] });
});

scenesRoutes.post("/", zValidator("json", createSceneSchema), async (c) => {
  const body = c.req.valid("json");
  const id = nanoid();

  const existing = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.sceneId, body.scene_id))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "Scene with this scene_id already exists" }, 409);
  }

  await insertSceneRecord(body, id, body.split);

  const result = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.id, id))
    .limit(1);

  return c.json({ data: result[0] }, 201);
});

scenesRoutes.put("/:id", zValidator("json", updateSceneSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await fetchSceneById(id);
  if (!existing) {
    return c.json({ error: "Scene not found" }, 404);
  }

  const result = await updateScene(id, body);
  return c.json({ data: result });
});

scenesRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "Scene not found" }, 404);
  }

  await db.delete(schema.scenes).where(eq(schema.scenes.id, id));

  return c.json({ success: true });
});

scenesRoutes.post("/bulk", zValidator("json", bulkImportSchema), async (c) => {
  const body = c.req.valid("json");
  const results = await importScenes(body.scenes, body.defaultSplit);

  return c.json({ data: results });
});

scenesRoutes.patch("/bulk/split", async (c) => {
  const body = await c.req.json<{
    ids: string[];
    split: "train" | "dev" | "test";
  }>();

  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: "ids array is required" }, 400);
  }

  if (!body.split || !["train", "dev", "test"].includes(body.split)) {
    return c.json({ error: "Valid split value is required" }, 400);
  }

  await db
    .update(schema.scenes)
    .set({ split: body.split, updatedAt: new Date().toISOString() })
    .where(inArray(schema.scenes.id, body.ids));

  return c.json({ success: true, updated: body.ids.length });
});

export { scenesRoutes };

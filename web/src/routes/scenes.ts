import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, like, inArray, sql, desc, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client";
import { sceneSchema } from "../types/scene";

const scenesRoutes = new Hono();

const listQuerySchema = z.object({
  split: z.enum(["train", "dev", "test"]).optional(),
  tags: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  sort: z.enum(["created_at", "updated_at", "scene_id"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const createSceneSchema = sceneSchema.extend({
  split: z.enum(["train", "dev", "test"]).optional(),
  tags: z.array(z.string()).default([]),
});

const updateSceneSchema = createSceneSchema.partial();

const bulkImportSchema = z.object({
  scenes: z.array(createSceneSchema),
  defaultSplit: z.enum(["train", "dev", "test"]).optional(),
});

scenesRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query");

  const conditions = [];

  if (query.split) {
    conditions.push(eq(schema.scenes.split, query.split));
  }

  if (query.search) {
    conditions.push(like(schema.scenes.sceneId, `%${query.search}%`));
  }

  const orderColumn =
    query.sort === "scene_id"
      ? schema.scenes.sceneId
      : query.sort === "updated_at"
        ? schema.scenes.updatedAt
        : schema.scenes.createdAt;

  const orderFn = query.order === "asc" ? asc : desc;

  const results = await db
    .select()
    .from(schema.scenes)
    .where(
      conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined,
    )
    .orderBy(orderFn(orderColumn))
    .limit(query.limit)
    .offset(query.offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.scenes)
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

  await db.insert(schema.scenes).values({
    id,
    sceneId: body.scene_id,
    langSrc: body.lang_src,
    langTgt: body.lang_tgt,
    segments: body.segments,
    worldState: body.world_state,
    characterStates: body.character_states,
    constraints: body.constraints,
    evalTargets: body.eval_targets,
    split: body.split,
    tags: body.tags,
  });

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

  const existing = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "Scene not found" }, 404);
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.scene_id !== undefined) updateData["sceneId"] = body.scene_id;
  if (body.lang_src !== undefined) updateData["langSrc"] = body.lang_src;
  if (body.lang_tgt !== undefined) updateData["langTgt"] = body.lang_tgt;
  if (body.segments !== undefined) updateData["segments"] = body.segments;
  if (body.world_state !== undefined)
    updateData["worldState"] = body.world_state;
  if (body.character_states !== undefined)
    updateData["characterStates"] = body.character_states;
  if (body.constraints !== undefined)
    updateData["constraints"] = body.constraints;
  if (body.eval_targets !== undefined)
    updateData["evalTargets"] = body.eval_targets;
  if (body.split !== undefined) updateData["split"] = body.split;
  if (body.tags !== undefined) updateData["tags"] = body.tags;

  await db
    .update(schema.scenes)
    .set(updateData)
    .where(eq(schema.scenes.id, id));

  const result = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.id, id))
    .limit(1);

  return c.json({ data: result[0] });
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
  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as Array<{ scene_id: string; error: string }>,
  };

  for (const scene of body.scenes) {
    const existing = await db
      .select()
      .from(schema.scenes)
      .where(eq(schema.scenes.sceneId, scene.scene_id))
      .limit(1);

    if (existing.length > 0) {
      results.skipped++;
      continue;
    }

    try {
      const id = nanoid();
      await db.insert(schema.scenes).values({
        id,
        sceneId: scene.scene_id,
        langSrc: scene.lang_src,
        langTgt: scene.lang_tgt,
        segments: scene.segments,
        worldState: scene.world_state,
        characterStates: scene.character_states,
        constraints: scene.constraints,
        evalTargets: scene.eval_targets,
        split: scene.split ?? body.defaultSplit,
        tags: scene.tags,
      });
      results.imported++;
    } catch (err) {
      results.errors.push({
        scene_id: scene.scene_id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

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

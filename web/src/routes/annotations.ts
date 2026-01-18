import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client";

const annotationsRoutes = new Hono();

const listQuerySchema = z.object({
  runId: z.string().optional(),
  sceneId: z.string().optional(),
  errorType: z.enum(["KL", "FB", "REF", "IMPL", "LEX", "CONS"]).optional(),
  severity: z.enum(["fatal", "major", "minor"]).optional(),
  annotator: z.string().optional(),
  limit: z.coerce.number().int().positive().default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const createAnnotationSchema = z.object({
  runId: z.string().optional(),
  sceneId: z.string().optional(),
  segmentT: z.number().int().optional(),
  errorType: z.enum(["KL", "FB", "REF", "IMPL", "LEX", "CONS"]),
  severity: z.enum(["fatal", "major", "minor"]),
  linkedState: z.array(z.string()).default([]),
  rationale: z.string().optional(),
  fixSuggestion: z.string().optional(),
  annotator: z.string().optional(),
});

const updateAnnotationSchema = createAnnotationSchema.partial();

annotationsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query");

  const conditions = [];

  if (query.runId) {
    conditions.push(eq(schema.annotations.runId, query.runId));
  }
  if (query.sceneId) {
    conditions.push(eq(schema.annotations.sceneId, query.sceneId));
  }
  if (query.errorType) {
    conditions.push(eq(schema.annotations.errorType, query.errorType));
  }
  if (query.severity) {
    conditions.push(eq(schema.annotations.severity, query.severity));
  }
  if (query.annotator) {
    conditions.push(eq(schema.annotations.annotator, query.annotator));
  }

  const results = await db
    .select()
    .from(schema.annotations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.annotations.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.annotations)
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

annotationsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await db
    .select()
    .from(schema.annotations)
    .where(eq(schema.annotations.id, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Annotation not found" }, 404);
  }

  return c.json({ data: result[0] });
});

annotationsRoutes.post(
  "/",
  zValidator("json", createAnnotationSchema),
  async (c) => {
    const body = c.req.valid("json");
    const id = nanoid();

    await db.insert(schema.annotations).values({
      id,
      runId: body.runId,
      sceneId: body.sceneId,
      segmentT: body.segmentT,
      errorType: body.errorType,
      severity: body.severity,
      linkedState: body.linkedState,
      rationale: body.rationale,
      fixSuggestion: body.fixSuggestion,
      annotator: body.annotator,
    });

    const result = await db
      .select()
      .from(schema.annotations)
      .where(eq(schema.annotations.id, id))
      .limit(1);

    return c.json({ data: result[0] }, 201);
  },
);

annotationsRoutes.put(
  "/:id",
  zValidator("json", updateAnnotationSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await db
      .select()
      .from(schema.annotations)
      .where(eq(schema.annotations.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Annotation not found" }, 404);
    }

    const updateData: Record<string, unknown> = {};

    if (body.runId !== undefined) updateData["runId"] = body.runId;
    if (body.sceneId !== undefined) updateData["sceneId"] = body.sceneId;
    if (body.segmentT !== undefined) updateData["segmentT"] = body.segmentT;
    if (body.errorType !== undefined) updateData["errorType"] = body.errorType;
    if (body.severity !== undefined) updateData["severity"] = body.severity;
    if (body.linkedState !== undefined)
      updateData["linkedState"] = body.linkedState;
    if (body.rationale !== undefined) updateData["rationale"] = body.rationale;
    if (body.fixSuggestion !== undefined)
      updateData["fixSuggestion"] = body.fixSuggestion;
    if (body.annotator !== undefined) updateData["annotator"] = body.annotator;

    await db
      .update(schema.annotations)
      .set(updateData)
      .where(eq(schema.annotations.id, id));

    const result = await db
      .select()
      .from(schema.annotations)
      .where(eq(schema.annotations.id, id))
      .limit(1);

    return c.json({ data: result[0] });
  },
);

annotationsRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db
    .select()
    .from(schema.annotations)
    .where(eq(schema.annotations.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "Annotation not found" }, 404);
  }

  await db.delete(schema.annotations).where(eq(schema.annotations.id, id));

  return c.json({ success: true });
});

annotationsRoutes.post("/bulk", async (c) => {
  const body = await c.req.json<{
    annotations: z.infer<typeof createAnnotationSchema>[];
  }>();

  if (!body.annotations || !Array.isArray(body.annotations)) {
    return c.json({ error: "annotations array is required" }, 400);
  }

  const results = {
    imported: 0,
    errors: [] as Array<{ index: number; error: string }>,
  };

  for (let i = 0; i < body.annotations.length; i++) {
    const annotation = body.annotations[i];
    if (!annotation) continue;

    try {
      const id = nanoid();
      await db.insert(schema.annotations).values({
        id,
        runId: annotation.runId,
        sceneId: annotation.sceneId,
        segmentT: annotation.segmentT,
        errorType: annotation.errorType,
        severity: annotation.severity,
        linkedState: annotation.linkedState,
        rationale: annotation.rationale,
        fixSuggestion: annotation.fixSuggestion,
        annotator: annotation.annotator,
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

export { annotationsRoutes };

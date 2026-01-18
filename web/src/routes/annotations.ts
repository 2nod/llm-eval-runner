import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";

import { db, schema } from "../db/client";

const annotationsRoutes = new Hono();

const listQuerySchema = z.object({
  annotator: z.string().optional(),
  errorType: z.enum(["KL", "FB", "REF", "IMPL", "LEX", "CONS"]).optional(),
  limit: z.coerce.number().int().positive().default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
  runId: z.string().optional(),
  sceneId: z.string().optional(),
  severity: z.enum(["fatal", "major", "minor"]).optional(),
});

const createAnnotationSchema = z.object({
  annotator: z.string().optional(),
  errorType: z.enum(["KL", "FB", "REF", "IMPL", "LEX", "CONS"]),
  fixSuggestion: z.string().optional(),
  linkedState: z.array(z.string()).default([]),
  rationale: z.string().optional(),
  runId: z.string().optional(),
  sceneId: z.string().optional(),
  segmentT: z.number().int().optional(),
  severity: z.enum(["fatal", "major", "minor"]),
});

const updateAnnotationSchema = createAnnotationSchema.partial();

const pushIfDefined = <T>(conditions: T[], value: unknown, condition: T) => {
  if (value === undefined) {
    return;
  }
  conditions.push(condition);
};

const buildAnnotationConditions = (query: z.infer<typeof listQuerySchema>) => {
  const conditions = [];

  pushIfDefined(
    conditions,
    query.runId,
    eq(schema.annotations.runId, query.runId)
  );
  pushIfDefined(
    conditions,
    query.sceneId,
    eq(schema.annotations.sceneId, query.sceneId)
  );
  pushIfDefined(
    conditions,
    query.errorType,
    eq(schema.annotations.errorType, query.errorType)
  );
  pushIfDefined(
    conditions,
    query.severity,
    eq(schema.annotations.severity, query.severity)
  );
  pushIfDefined(
    conditions,
    query.annotator,
    eq(schema.annotations.annotator, query.annotator)
  );

  return conditions;
};

const fetchAnnotationsList = async (query: z.infer<typeof listQuerySchema>) => {
  const conditions = buildAnnotationConditions(query);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(schema.annotations)
    .where(whereClause)
    .orderBy(desc(schema.annotations.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.annotations)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  return { results, total };
};

const fetchAnnotationById = async (id: string) => {
  const [annotation] = await db
    .select()
    .from(schema.annotations)
    .where(eq(schema.annotations.id, id))
    .limit(1);
  return annotation ?? null;
};

const insertAnnotation = async (
  annotation: z.infer<typeof createAnnotationSchema>,
  id: string
) => {
  await db.insert(schema.annotations).values({
    annotator: annotation.annotator,
    errorType: annotation.errorType,
    fixSuggestion: annotation.fixSuggestion,
    id,
    linkedState: annotation.linkedState,
    rationale: annotation.rationale,
    runId: annotation.runId,
    sceneId: annotation.sceneId,
    segmentT: annotation.segmentT,
    severity: annotation.severity,
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

const buildAnnotationUpdateData = (
  body: z.infer<typeof updateAnnotationSchema>
) => {
  const updateData: Record<string, unknown> = {};
  const entries: [string, unknown][] = [
    ["annotator", body.annotator],
    ["errorType", body.errorType],
    ["fixSuggestion", body.fixSuggestion],
    ["linkedState", body.linkedState],
    ["rationale", body.rationale],
    ["runId", body.runId],
    ["sceneId", body.sceneId],
    ["segmentT", body.segmentT],
    ["severity", body.severity],
  ];

  for (const [key, value] of entries) {
    assignIfDefined(updateData, key, value);
  }
  return updateData;
};

const updateAnnotation = async (
  id: string,
  body: z.infer<typeof updateAnnotationSchema>
) => {
  const updateData = buildAnnotationUpdateData(body);
  await db
    .update(schema.annotations)
    .set(updateData)
    .where(eq(schema.annotations.id, id));
  return fetchAnnotationById(id);
};

const createBulkResults = () => ({
  errors: [] as { error: string; index: number }[],
  imported: 0,
});

const importAnnotationWithIndex = async (
  annotation: z.infer<typeof createAnnotationSchema> | undefined,
  index: number,
  results: ReturnType<typeof createBulkResults>
) => {
  if (!annotation) {
    return;
  }

  try {
    const id = nanoid();
    await insertAnnotation(annotation, id);
    results.imported += 1;
  } catch (error) {
    results.errors.push({
      error: error instanceof Error ? error.message : "Unknown error",
      index,
    });
  }
};

const importAnnotations = async (
  annotations: z.infer<typeof createAnnotationSchema>[]
) => {
  const results = createBulkResults();

  for (const [index, annotation] of annotations.entries()) {
    await importAnnotationWithIndex(annotation, index, results);
  }

  return results;
};

annotationsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const { results, total } = await fetchAnnotationsList(query);

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
      annotator: body.annotator,
      errorType: body.errorType,
      fixSuggestion: body.fixSuggestion,
      id,
      linkedState: body.linkedState,
      rationale: body.rationale,
      runId: body.runId,
      sceneId: body.sceneId,
      segmentT: body.segmentT,
      severity: body.severity,
    });

    const result = await db
      .select()
      .from(schema.annotations)
      .where(eq(schema.annotations.id, id))
      .limit(1);

    return c.json({ data: result[0] }, 201);
  }
);

annotationsRoutes.put(
  "/:id",
  zValidator("json", updateAnnotationSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await fetchAnnotationById(id);
    if (!existing) {
      return c.json({ error: "Annotation not found" }, 404);
    }

    const result = await updateAnnotation(id, body);
    return c.json({ data: result });
  }
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

  const results = await importAnnotations(body.annotations);

  return c.json({ data: results });
});

export { annotationsRoutes };

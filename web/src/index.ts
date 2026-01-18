import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { seedDatabaseIfEmpty } from "./db/seed";
import { annotationsRoutes } from "./routes/annotations";
import { experimentsRoutes } from "./routes/experiments";
import { runsRoutes } from "./routes/runs";
import { scenesRoutes } from "./routes/scenes";
import { statsRoutes } from "./routes/stats";

const app = new Hono();
const staticRoot = (() => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, "..", "app", "dist");
})();
const serveDist = serveStatic({ root: staticRoot });
const serveIndex = serveStatic({ path: "index.html", root: staticRoot });

app.use("*", logger());
app.use("*", cors());
app.use("*", prettyJSON());

try {
  await seedDatabaseIfEmpty();
} catch (error) {
  console.error("Failed to seed database:", error);
}

app.get("/api", (c) =>
  c.json({
    endpoints: {
      annotations: "/api/annotations",
      experiments: "/api/experiments",
      runs: "/api/runs",
      scenes: "/api/scenes",
      stats: "/api/stats",
    },
    name: "llm-eval-runner API",
    version: "1.0.0",
  })
);

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

app.route("/api/scenes", scenesRoutes);
app.route("/api/experiments", experimentsRoutes);
app.route("/api/runs", runsRoutes);
app.route("/api/annotations", annotationsRoutes);
app.route("/api/stats", statsRoutes);

app.use("*", (c, next) => {
  const requestPath = c.req.path;
  const isApiRequest =
    requestPath === "/api" || requestPath.startsWith("/api/");
  if (isApiRequest) {
    return next();
  }
  const isStaticAsset =
    requestPath.startsWith("/assets/") ||
    requestPath === "/vite.svg" ||
    requestPath === "/favicon.ico" ||
    requestPath === "/favicon.svg";
  if (isStaticAsset) {
    return serveDist(c, next);
  }
  return serveIndex(c, next);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

const handleAppError = (err: Error, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error", message: err.message }, 500);
};

app.onError(handleAppError);

const port = Number(process.env["PORT"]) || 3000;

console.log(`Starting server on port ${port}...`);

export default {
  fetch: app.fetch,
  port,
};

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { scenesRoutes } from "./routes/scenes";
import { experimentsRoutes } from "./routes/experiments";
import { runsRoutes } from "./routes/runs";
import { annotationsRoutes } from "./routes/annotations";
import { statsRoutes } from "./routes/stats";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());
app.use("*", prettyJSON());

app.get("/", (c) => {
  return c.json({
    name: "llm-eval-runner API",
    version: "1.0.0",
    endpoints: {
      scenes: "/api/scenes",
      experiments: "/api/experiments",
      runs: "/api/runs",
      annotations: "/api/annotations",
      stats: "/api/stats",
    },
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/api/scenes", scenesRoutes);
app.route("/api/experiments", experimentsRoutes);
app.route("/api/runs", runsRoutes);
app.route("/api/annotations", annotationsRoutes);
app.route("/api/stats", statsRoutes);

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error", message: err.message }, 500);
});

const port = Number(process.env["PORT"]) || 3000;

console.log(`Starting server on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};

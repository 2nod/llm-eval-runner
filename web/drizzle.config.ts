import { defineConfig } from "drizzle-kit";

const dbUrl = process.env["DATABASE_URL"] ?? "./data/eval.db";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbUrl,
  },
});

import { defineConfig } from "drizzle-kit";

const dbUrl = process.env["DATABASE_URL"] ?? "./data/eval.db";

export default defineConfig({
  dbCredentials: {
    url: dbUrl,
  },
  dialect: "sqlite",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});

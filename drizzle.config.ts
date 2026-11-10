import { type Config } from "drizzle-kit";

// Only generates SQL into ./drizzle; wrangler applies it (db:migrate:local / db:migrate:remote)
export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
} satisfies Config;

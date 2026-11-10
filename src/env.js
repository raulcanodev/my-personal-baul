import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Bindings (D1) come from wrangler.jsonc. Plain vars come from .env in `next dev`
// and from Worker secrets in production (`wrangler secret put BETTER_AUTH_SECRET`).
export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {},
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

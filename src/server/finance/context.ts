import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { Db } from "@/server/db";

export { newId } from "./ids";

export type FinanceContext = { db: Db; userId: string };

/** The secret that encrypts bank API keys (a Worker secret in production, .env/.dev.vars locally) */
export function getEncryptionSecret() {
  const env = getCloudflareContext().env as unknown as Record<
    string,
    string | undefined
  >;
  const secret = env.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return secret;
}

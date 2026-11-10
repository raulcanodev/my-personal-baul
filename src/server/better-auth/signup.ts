import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sql } from "drizzle-orm";

import { getDb } from "@/server/db";
import { user } from "@/server/db/schema";

/**
 * Who can create an account:
 * - "open": nobody has signed up yet, the first person to register owns the baúl
 * - "invite": there are users, and SIGNUP_CODE is set (a Worker secret): friends need that code
 * - "closed": there are users and no code
 */
export type SignupStatus = "open" | "invite" | "closed";

export function getSignupCode() {
  const env = getCloudflareContext().env as unknown as Record<
    string,
    string | undefined
  >;
  return env.SIGNUP_CODE ?? process.env.SIGNUP_CODE;
}

export async function getSignupStatus(): Promise<SignupStatus> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(user);
  if (!row?.count) return "open";
  return getSignupCode() ? "invite" : "closed";
}

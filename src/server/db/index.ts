import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

// The D1 binding only exists inside a request, so the client is built per call (it is cheap)
export function getDb() {
  return drizzle(getCloudflareContext().env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;

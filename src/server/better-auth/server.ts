import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from ".";

export const getSession = cache(async () => {
  // headers() first: it marks the route dynamic before the D1 binding is touched
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

/** For server components and actions that need a signed-in user */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

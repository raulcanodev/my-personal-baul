import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

import { getDb } from "@/server/db";
import * as schema from "@/server/db/schema";

function createAuth() {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // Nobody signs up from the web: users are created with `pnpm user:create`
      disableSignUp: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    plugins: [username(), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Bound to the request's D1 binding, so it is created on demand
export function getAuth(): Auth {
  return createAuth();
}

export type Session = Auth["$Infer"]["Session"];

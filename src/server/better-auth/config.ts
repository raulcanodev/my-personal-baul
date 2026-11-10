import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

import { getDb } from "@/server/db";
import * as schema from "@/server/db/schema";
import { getSignupCode, getSignupStatus } from "./signup";

function createAuth() {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    hooks: {
      // Sign-up gate (see signup.ts): first user free, then only with the invite code
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const status = await getSignupStatus();
        if (status === "open") return;
        const code = ctx.headers?.get("x-invite-code")?.trim();
        if (status === "invite" && code && code === getSignupCode()) return;
        throw new APIError("FORBIDDEN", {
          message:
            status === "invite"
              ? "Código de invitación no válido"
              : "El registro está cerrado",
        });
      }),
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

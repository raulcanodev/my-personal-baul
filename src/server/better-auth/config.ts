import "server-only";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { jwt, username } from "better-auth/plugins";

import { getDb } from "@/server/db";
import * as schema from "@/server/db/schema";
import { fetchClientMetadataResource } from "./cimd-fetch";
import { getSignupCode, getSignupStatus } from "./signup";

/**
 * Canonical origin (https://baul.raulcano.dev in production, localhost in dev). Read per request:
 * Worker vars are not guaranteed in process.env while modules load.
 */
export const getBaseURL = () =>
  process.env.BETTER_AUTH_URL ?? "http://localhost:43871";
/** The MCP endpoint: OAuth access tokens are issued for (audience-bound to) this resource */
export const getMcpResource = () => `${getBaseURL()}/api/mcp`;
export const MCP_SCOPES = ["baul:read", "baul:write"] as const;

function createAuth() {
  const baseURL = getBaseURL();
  return betterAuth({
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: ["https://baul.rawraul.workers.dev"],
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
    // The JWT plugin only signs OAuth access tokens; browsers keep normal session cookies
    disabledPaths: ["/token"],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      // Check the database so deleted users and revoked sessions stop working immediately.
      cookieCache: { enabled: false },
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
    plugins: [
      username(),
      jwt({ disableSettingJwtHeader: true }),
      // OAuth 2.1 for MCP clients (Claude, Cursor…): log in once, tokens refresh on their own
      mcp({
        loginPage: "/login",
        consentPage: "/oauth/consent",
        resource: getMcpResource(),
        scopes: ["openid", "profile", "offline_access", ...MCP_SCOPES],
        // Clients that register themselves (Claude Code) or identify by URL (CIMD, claude.ai).
        // Registering grants nothing: the user still logs in and approves on the consent page.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        clientRegistrationDefaultScopes: [
          "openid",
          "offline_access",
          ...MCP_SCOPES,
        ],
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Bound to the request's D1 binding, so it is created on demand
export function getAuth(): Auth {
  return createAuth();
}

export type Session = Auth["$Infer"]["Session"];

import { requireMcpAuth } from "@better-auth/mcp";

import { getAuth } from "@/server/better-auth";
import { getMcpResource } from "@/server/better-auth/config";
import { getDb } from "@/server/db";
import { getEncryptionSecret } from "@/server/finance/context";
import { createBaulMcpHandler } from "@/server/tools/mcp-server";

// MCP endpoint for agents (Claude, Cursor…). OAuth: an unauthenticated request gets a 401 that
// points the client to /.well-known/oauth-protected-resource, it logs the user in once, and
// refreshes its token on its own after that.
async function handle(request: Request) {
  const protectedHandler = requireMcpAuth(
    getAuth(),
    (req, claims) => {
      const userId = typeof claims.sub === "string" ? claims.sub : null;
      if (!userId) return new Response("Token sin usuario", { status: 401 });
      const scopes = new Set(
        typeof claims.scope === "string" ? claims.scope.split(" ") : [],
      );
      const handler = createBaulMcpHandler(
        { db: getDb(), userId, secret: getEncryptionSecret },
        scopes,
      );
      return handler.fetch(req);
    },
    {
      resource: getMcpResource(),
      requiredScopes: ["baul:read"],
      challengeScopes: ["baul:read", "baul:write"],
    },
  );
  return protectedHandler(request);
}

export { handle as GET, handle as POST, handle as DELETE };

import { getAuth } from "@/server/better-auth";

// OAuth discovery for MCP clients lives at the site root (RFC 8414 / RFC 9728 / OIDC):
// /.well-known/oauth-protected-resource/api/mcp, /.well-known/oauth-authorization-server/api/auth…
// The Better Auth plugins answer these paths themselves, they only need to reach its handler.
const handler = (request: Request) => getAuth().handler(request);

export { handler as GET };

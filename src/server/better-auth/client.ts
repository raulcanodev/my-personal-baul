import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// oauthProviderClient carries a pending OAuth request (an MCP client asking for access) through
// login and consent: sign-in then answers with the URL to continue to.
export const authClient = createAuthClient({
  plugins: [usernameClient(), oauthProviderClient()],
});

export type Session = typeof authClient.$Infer.Session;

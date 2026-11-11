import { z } from "zod";

import {
  disconnectApp,
  listConnectedApps,
} from "@/server/account/connected-apps";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getMcpResource } from "@/server/better-auth/config";

export const accountRouter = createTRPCRouter({
  /** MCP endpoint to paste in Claude/ChatGPT and the agents already connected */
  agents: protectedProcedure.query(async ({ ctx }) => ({
    mcpUrl: getMcpResource(),
    apps: await listConnectedApps(ctx.db, ctx.session.user.id),
  })),
  disconnectApp: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .mutation(({ ctx, input }) =>
      disconnectApp(ctx.db, ctx.session.user.id, input.clientId),
    ),
});

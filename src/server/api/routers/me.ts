import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const meRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => ({
    id: ctx.session.user.id,
    name: ctx.session.user.name,
  })),
});

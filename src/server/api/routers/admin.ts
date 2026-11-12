import { TRPCError } from "@trpc/server";
import { aliasedTable, and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { inviteCodes, session, user } from "@/server/db/schema";

// No 0/O/1/I/L: codes get read out loud and typed on phones
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function newInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

const creator = aliasedTable(user, "creator");
const invitee = aliasedTable(user, "invitee");

export const adminRouter = createTRPCRouter({
  users: adminProcedure.query(async ({ ctx }) => {
    const lastSeen = ctx.db
      .select({
        userId: session.userId,
        at: sql<number>`max(${session.updatedAt})`.as("at"),
      })
      .from(session)
      .groupBy(session.userId)
      .as("last_seen");
    const rows = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        username: user.displayUsername,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        lastSeenAt: lastSeen.at,
        inviteCode: inviteCodes.code,
        inviteNote: inviteCodes.note,
      })
      .from(user)
      .leftJoin(lastSeen, eq(lastSeen.userId, user.id))
      .leftJoin(inviteCodes, eq(inviteCodes.usedBy, user.id))
      .orderBy(desc(user.createdAt));
    return rows.map((r) => ({
      ...r,
      lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt) : null,
    }));
  }),

  invites: createTRPCRouter({
    list: adminProcedure.query(({ ctx }) =>
      ctx.db
        .select({
          code: inviteCodes.code,
          note: inviteCodes.note,
          createdAt: inviteCodes.createdAt,
          usedAt: inviteCodes.usedAt,
          createdBy: creator.displayUsername,
          usedBy: invitee.displayUsername,
        })
        .from(inviteCodes)
        .leftJoin(creator, eq(inviteCodes.createdBy, creator.id))
        .leftJoin(invitee, eq(inviteCodes.usedBy, invitee.id))
        .orderBy(desc(inviteCodes.createdAt)),
    ),
    create: adminProcedure
      .input(z.object({ note: z.string().trim().max(80).optional() }))
      .mutation(async ({ ctx, input }) => {
        const code = newInviteCode();
        await ctx.db.insert(inviteCodes).values({
          code,
          createdBy: ctx.session.user.id,
          note: input.note?.length ? input.note : null,
        });
        return { code };
      }),
    /** Only unused codes can be revoked; used ones stay as the record of who invited whom */
    revoke: adminProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await ctx.db
          .delete(inviteCodes)
          .where(
            and(eq(inviteCodes.code, input.code), isNull(inviteCodes.usedAt)),
          )
          .returning({ code: inviteCodes.code });
        if (!deleted.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "El código no existe o ya se ha usado",
          });
      }),
  }),
});

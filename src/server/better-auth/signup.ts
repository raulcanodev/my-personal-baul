import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/server/db";
import { inviteCodes, user } from "@/server/db/schema";

/**
 * Who can create an account:
 * - "open": nobody has signed up yet, the first person to register owns the baúl (and is admin)
 * - "invite": there are users; signing up needs a single-use code the admin creates
 */
export type SignupStatus = "open" | "invite";

export async function getSignupStatus(): Promise<SignupStatus> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(user);
  return row?.count ? "invite" : "open";
}

/** Codes are stored upper-case; people may type them in any case */
export const normalizeInviteCode = (code: string) => code.trim().toUpperCase();

export async function isInviteCodeAvailable(code: string) {
  const [row] = await getDb()
    .select({ code: inviteCodes.code })
    .from(inviteCodes)
    .where(
      and(
        eq(inviteCodes.code, normalizeInviteCode(code)),
        isNull(inviteCodes.usedAt),
      ),
    );
  return !!row;
}

/** Marks the code as used by the account that was just created */
export async function consumeInviteCode(code: string, userId: string) {
  await getDb()
    .update(inviteCodes)
    .set({ usedBy: userId, usedAt: new Date() })
    .where(
      and(
        eq(inviteCodes.code, normalizeInviteCode(code)),
        isNull(inviteCodes.usedAt),
      ),
    );
}

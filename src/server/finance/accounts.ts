import { and, asc, eq } from "drizzle-orm";

import type { Db } from "@/server/db";
import {
  balanceSnapshots,
  bankConnections,
  moneyAccounts,
  type Scope,
} from "@/server/db/schema";
import type { FinanceContext } from "./context";
import { newId } from "./ids";
import { getRates, todayIso, toBase } from "./money";

export async function recordBalance(
  db: Db,
  accountId: string,
  balanceCents: number,
) {
  const now = new Date();
  await db.batch([
    db
      .update(moneyAccounts)
      .set({ balanceCents, balanceUpdatedAt: now })
      .where(eq(moneyAccounts.id, accountId)),
    db
      .insert(balanceSnapshots)
      .values({ accountId, day: todayIso(now), balanceCents })
      .onConflictDoUpdate({
        target: [balanceSnapshots.accountId, balanceSnapshots.day],
        set: { balanceCents },
      }),
  ]);
}

export async function listAccounts({ db, userId }: FinanceContext) {
  const rows = await db
    .select({
      account: moneyAccounts,
      provider: bankConnections.provider,
      connectionName: bankConnections.name,
      lastSyncedAt: bankConnections.lastSyncedAt,
      lastError: bankConnections.lastError,
    })
    .from(moneyAccounts)
    .leftJoin(
      bankConnections,
      eq(moneyAccounts.connectionId, bankConnections.id),
    )
    .where(
      and(
        eq(moneyAccounts.userId, userId),
        eq(moneyAccounts.isArchived, false),
      ),
    )
    .orderBy(asc(moneyAccounts.name));
  const rates = await getRates();
  const items = rows.map(({ account, ...connection }) => ({
    ...account,
    ...connection,
    baseBalanceCents: toBase(account.balanceCents, account.currency, rates),
  }));
  return {
    items,
    totalCents: items.reduce((n, a) => n + a.baseBalanceCents, 0),
  };
}

export async function createManualAccount(
  ctx: FinanceContext,
  input: { name: string; currency: string; scope: Scope; balanceCents: number },
) {
  const id = newId("acc");
  await ctx.db.insert(moneyAccounts).values({
    id,
    userId: ctx.userId,
    name: input.name,
    currency: input.currency,
    scope: input.scope,
  });
  await recordBalance(ctx.db, id, input.balanceCents);
  return { id };
}

export async function updateAccount(
  { db, userId }: FinanceContext,
  id: string,
  input: {
    name?: string;
    scope?: Scope;
    balanceCents?: number;
    isArchived?: boolean;
  },
) {
  const { balanceCents, ...rest } = input;
  const [account] = await db
    .select()
    .from(moneyAccounts)
    .where(and(eq(moneyAccounts.id, id), eq(moneyAccounts.userId, userId)));
  if (!account) throw new Error("Cuenta no encontrada");
  if (Object.keys(rest).length > 0) {
    await db.update(moneyAccounts).set(rest).where(eq(moneyAccounts.id, id));
  }
  // Synced accounts take their balance from the bank
  if (balanceCents !== undefined && !account.connectionId) {
    await recordBalance(db, id, balanceCents);
  }
}

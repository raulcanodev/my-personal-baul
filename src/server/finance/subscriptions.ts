import { and, asc, eq } from "drizzle-orm";

import {
  subscriptions,
  type BillingCycle,
  type Scope,
} from "@/server/db/schema";
import type { FinanceContext } from "./context";
import { newId } from "./ids";
import { getRates, monthlyCents, toBase } from "./money";

export type SubscriptionInput = {
  name: string;
  amountCents: number;
  currency: string;
  cycle: BillingCycle;
  scope: Scope;
  categoryId?: string | null;
  nextChargeOn?: string | null;
  isActive?: boolean;
  url?: string | null;
  notes?: string | null;
};

export async function listSubscriptions({ db, userId }: FinanceContext) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(asc(subscriptions.name));
  const rates = await getRates();
  const items = rows.map((s) => ({
    ...s,
    monthlyCents: monthlyCents(s.amountCents, s.cycle),
    monthlyBaseCents: toBase(
      monthlyCents(s.amountCents, s.cycle),
      s.currency,
      rates,
    ),
  }));
  const active = items.filter((s) => s.isActive);
  const sum = (scope?: Scope) =>
    active
      .filter((s) => !scope || s.scope === scope)
      .reduce((n, s) => n + s.monthlyBaseCents, 0);
  return {
    items,
    summary: {
      monthlyCents: sum(),
      yearlyCents: sum() * 12,
      personalMonthlyCents: sum("personal"),
      workMonthlyCents: sum("work"),
      activeCount: active.length,
    },
  };
}

export async function createSubscription(
  ctx: FinanceContext,
  input: SubscriptionInput,
) {
  const [row] = await ctx.db
    .insert(subscriptions)
    .values({ id: newId("sub"), userId: ctx.userId, ...input })
    .returning();
  return row!;
}

export async function updateSubscription(
  { db, userId }: FinanceContext,
  id: string,
  input: Partial<SubscriptionInput>,
) {
  await db
    .update(subscriptions)
    .set(input)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
}

export async function deleteSubscription(
  { db, userId }: FinanceContext,
  id: string,
) {
  await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
}

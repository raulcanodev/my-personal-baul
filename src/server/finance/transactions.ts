import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  categories,
  merchantRules,
  moneyAccounts,
  transactions,
  type Scope,
} from "@/server/db/schema";
import { applyRuleToExisting } from "./connections";
import type { FinanceContext } from "./context";
import { newId } from "./ids";
import { normalizeMerchant } from "./merchant";

export type TransactionFilters = {
  search?: string;
  accountIds?: string[];
  categoryIds?: string[];
  /** "uncategorized" is a pseudo category */
  uncategorized?: boolean;
  scope?: Scope;
  direction?: "in" | "out";
  from?: string;
  to?: string;
};

function buildWhere(userId: string, f: TransactionFilters) {
  const where: SQL[] = [eq(transactions.userId, userId)];
  if (f.search?.trim()) {
    const term = `%${f.search.trim()}%`;
    where.push(
      or(
        like(transactions.description, term),
        like(transactions.counterparty, term),
        like(transactions.note, term),
      )!,
    );
  }
  if (f.accountIds?.length)
    where.push(inArray(transactions.accountId, f.accountIds));
  const categoryFilters: SQL[] = [];
  if (f.categoryIds?.length)
    categoryFilters.push(inArray(transactions.categoryId, f.categoryIds));
  if (f.uncategorized) categoryFilters.push(isNull(transactions.categoryId));
  if (categoryFilters.length) where.push(or(...categoryFilters)!);
  if (f.scope) where.push(eq(categories.scope, f.scope));
  if (f.direction === "in") where.push(gte(transactions.amountCents, 0));
  if (f.direction === "out") where.push(lt(transactions.amountCents, 0));
  if (f.from)
    where.push(gte(transactions.date, new Date(`${f.from}T00:00:00`)));
  if (f.to)
    where.push(lte(transactions.date, new Date(`${f.to}T23:59:59.999`)));
  return and(...where);
}

export async function listTransactions(
  { db, userId }: FinanceContext,
  filters: TransactionFilters,
  page: { limit: number; offset: number } = { limit: 50, offset: 0 },
) {
  const where = buildWhere(userId, filters);
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: transactions.id,
        externalId: transactions.externalId,
        date: transactions.date,
        description: transactions.description,
        counterparty: transactions.counterparty,
        merchant: transactions.merchant,
        amountCents: transactions.amountCents,
        currency: transactions.currency,
        status: transactions.status,
        note: transactions.note,
        reviewedAt: transactions.reviewedAt,
        categoryId: transactions.categoryId,
        subscriptionId: transactions.subscriptionId,
        accountId: transactions.accountId,
        accountName: moneyAccounts.name,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(transactions)
      .innerJoin(moneyAccounts, eq(transactions.accountId, moneyAccounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(desc(transactions.date))
      .limit(page.limit)
      .offset(page.offset),
    db
      .select({
        count: sql<number>`count(*)`,
        inCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} end), 0)`,
        outCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} end), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where),
  ]);
  return { items: rows, ...totals! };
}

/**
 * Sets the category (and optionally the subscription) of a transaction. With `rememberMerchant`
 * it becomes a merchant rule: future syncs and the pending ones of that merchant get it too.
 */
export async function categorizeTransaction(
  ctx: FinanceContext,
  input: {
    id: string;
    categoryId: string | null;
    subscriptionId?: string | null;
    note?: string | null;
    rememberMerchant?: boolean;
  },
) {
  const { db, userId } = ctx;
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.id), eq(transactions.userId, userId)));
  if (!tx) throw new Error("Movimiento no encontrado");
  const values = {
    categoryId: input.categoryId,
    subscriptionId: input.subscriptionId ?? tx.subscriptionId,
  };
  await db
    .update(transactions)
    .set({ ...values, note: input.note ?? tx.note, reviewedAt: new Date() })
    .where(eq(transactions.id, tx.id));

  if (input.rememberMerchant && tx.merchant) {
    await db
      .insert(merchantRules)
      .values({ id: newId("rul"), userId, merchant: tx.merchant, ...values })
      .onConflictDoUpdate({
        target: [merchantRules.userId, merchantRules.merchant],
        set: values,
      });
    await applyRuleToExisting(ctx, tx.merchant, values);
  }
}

export async function createManualTransaction(
  { db, userId }: FinanceContext,
  input: {
    accountId: string;
    date: string;
    description: string;
    amountCents: number;
    categoryId?: string | null;
    note?: string | null;
  },
) {
  const [account] = await db
    .select()
    .from(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.id, input.accountId),
        eq(moneyAccounts.userId, userId),
      ),
    );
  if (!account) throw new Error("Cuenta no encontrada");
  const id = newId("txn");
  await db.insert(transactions).values({
    id,
    userId,
    accountId: account.id,
    externalId: id,
    date: new Date(`${input.date}T12:00:00`),
    description: input.description,
    merchant: normalizeMerchant(null, input.description),
    amountCents: input.amountCents,
    currency: account.currency,
    categoryId: input.categoryId ?? null,
    note: input.note ?? null,
    reviewedAt: new Date(),
  });
  return { id };
}

export async function deleteManualTransaction(
  { db, userId }: FinanceContext,
  id: string,
) {
  // Synced ones would come back on the next sync, so only manual entries can be deleted
  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, userId),
        eq(transactions.externalId, id),
      ),
    );
}

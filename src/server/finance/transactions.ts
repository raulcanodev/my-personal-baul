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
  subscriptions,
  transactions,
  type Scope,
} from "@/server/db/schema";
import { applyRuleToExisting } from "./connections";
import type { FinanceContext } from "./context";
import { newId } from "./ids";
import { normalizeMerchant } from "./merchant";
import { getRates, toBase } from "./money";

export type TransactionFilters = {
  search?: string;
  accountIds?: string[];
  categoryIds?: string[];
  /** Charges linked to any of these subscriptions */
  subscriptionIds?: string[];
  /** "uncategorized" is a pseudo category */
  uncategorized?: boolean;
  scope?: Scope;
  direction?: "in" | "out";
  from?: string;
  to?: string;
};

const AMOUNT = /^[-+]?\d+(?:[.,]\d{1,2})?$/;

/**
 * Every word must appear somewhere (description, counterparty, merchant, note, account or
 * category), in any order. A number also matches the amount, so "36,80" or "36.80" finds the
 * €36.80 payment whatever its sign.
 */
function searchClauses(search: string): SQL[] {
  // D1 caps LIKE patterns at 50 bytes, so words are trimmed and limited
  const words = search.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return words.map((word) => {
    const term = `%${word.slice(0, 40)}%`;
    const text = or(
      like(transactions.description, term),
      like(transactions.counterparty, term),
      like(transactions.merchant, term),
      like(transactions.note, term),
      like(moneyAccounts.name, term),
      like(categories.name, term),
    )!;
    if (!AMOUNT.test(word)) return text;
    const cents = Math.round(Math.abs(Number(word.replace(",", "."))) * 100);
    return or(text, sql`abs(${transactions.amountCents}) = ${cents}`)!;
  });
}

function buildWhere(userId: string, f: TransactionFilters) {
  const where: SQL[] = [eq(transactions.userId, userId)];
  if (f.search?.trim()) where.push(...searchClauses(f.search));
  if (f.accountIds?.length)
    where.push(inArray(transactions.accountId, f.accountIds));
  const categoryFilters: SQL[] = [];
  if (f.categoryIds?.length)
    categoryFilters.push(inArray(transactions.categoryId, f.categoryIds));
  if (f.uncategorized) categoryFilters.push(isNull(transactions.categoryId));
  if (categoryFilters.length) where.push(or(...categoryFilters)!);
  if (f.subscriptionIds?.length)
    where.push(inArray(transactions.subscriptionId, f.subscriptionIds));
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
  const [rows, totalsByCurrency, rates] = await Promise.all([
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
        isOneOff: transactions.isOneOff,
        reviewedAt: transactions.reviewedAt,
        categoryId: transactions.categoryId,
        subscriptionId: transactions.subscriptionId,
        subscriptionName: subscriptions.name,
        accountId: transactions.accountId,
        accountName: moneyAccounts.name,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(transactions)
      .innerJoin(moneyAccounts, eq(transactions.accountId, moneyAccounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(
        subscriptions,
        eq(transactions.subscriptionId, subscriptions.id),
      )
      .where(where)
      .orderBy(desc(transactions.date))
      .limit(page.limit)
      .offset(page.offset),
    // Per currency so the totals can be converted; transfers between my own accounts are
    // counted but never added to "entradas"/"salidas"
    db
      .select({
        currency: transactions.currency,
        count: sql<number>`count(*)`,
        inCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 and coalesce(${categories.kind}, '') <> 'transfer' then ${transactions.amountCents} end), 0)`,
        outCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 and coalesce(${categories.kind}, '') <> 'transfer' then -${transactions.amountCents} end), 0)`,
      })
      .from(transactions)
      .innerJoin(moneyAccounts, eq(transactions.accountId, moneyAccounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .groupBy(transactions.currency),
    getRates(),
  ]);
  return {
    items: rows,
    count: totalsByCurrency.reduce((n, t) => n + t.count, 0),
    inCents: totalsByCurrency.reduce(
      (n, t) => n + toBase(t.inCents, t.currency, rates),
      0,
    ),
    outCents: totalsByCurrency.reduce(
      (n, t) => n + toBase(t.outCents, t.currency, rates),
      0,
    ),
  };
}

/** The subscription, if it exists and belongs to the user; throws otherwise */
async function ownSubscription({ db, userId }: FinanceContext, id: string) {
  const [sub] = await db
    .select({ id: subscriptions.id, categoryId: subscriptions.categoryId })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
  if (!sub) throw new Error("Suscripción no encontrada");
  return sub;
}

/**
 * Sets the category, subscription, note or one-off flag of a transaction; whatever is left
 * undefined is kept (null clears). Linking a subscription to an uncategorized charge also gives
 * it the subscription's category. With `rememberMerchant` and a category or subscription it
 * becomes a merchant rule: future syncs and the pending ones of that merchant get it too.
 */
export async function categorizeTransaction(
  ctx: FinanceContext,
  input: {
    id: string;
    categoryId?: string | null;
    subscriptionId?: string | null;
    note?: string | null;
    isOneOff?: boolean;
    rememberMerchant?: boolean;
  },
) {
  const { db, userId } = ctx;
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.id), eq(transactions.userId, userId)));
  if (!tx) throw new Error("Movimiento no encontrado");
  const sub = input.subscriptionId
    ? await ownSubscription(ctx, input.subscriptionId)
    : null;
  const categoryId =
    input.categoryId !== undefined
      ? input.categoryId
      : (tx.categoryId ?? sub?.categoryId ?? null);
  const values = {
    categoryId,
    subscriptionId:
      input.subscriptionId === undefined
        ? tx.subscriptionId
        : input.subscriptionId,
  };
  await db
    .update(transactions)
    .set({
      ...values,
      note: input.note === undefined ? tx.note : input.note,
      isOneOff: input.isOneOff ?? tx.isOneOff,
      reviewedAt: new Date(),
    })
    .where(eq(transactions.id, tx.id));

  // Only what was decided now is remembered for the merchant, so linking a subscription keeps
  // the merchant's category rule and vice versa
  const decided = {
    ...(input.categoryId !== undefined ? { categoryId } : {}),
    ...(input.subscriptionId !== undefined
      ? { subscriptionId: values.subscriptionId }
      : {}),
  };
  if (input.rememberMerchant && Object.keys(decided).length && tx.merchant) {
    await db
      .insert(merchantRules)
      .values({ id: newId("rul"), userId, merchant: tx.merchant, ...values })
      .onConflictDoUpdate({
        target: [merchantRules.userId, merchantRules.merchant],
        set: decided,
      });
    await applyRuleToExisting(ctx, tx.merchant, decided);
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

/**
 * Categorizes every transaction of a merchant at once and remembers it for future syncs.
 * Reviewed transactions keep their category unless `includeReviewed`.
 */
export async function categorizeMerchant(
  { db, userId }: FinanceContext,
  input: {
    merchant: string;
    categoryId: string | null;
    subscriptionId?: string | null;
    includeReviewed?: boolean;
    note?: string | null;
  },
) {
  if (input.subscriptionId)
    await ownSubscription({ db, userId }, input.subscriptionId);
  // Accept the merchant key or the raw bank name ("Amazon EU S.a.r.l." → "amazon eu")
  const exact = input.merchant.trim().toLowerCase();
  const [{ found } = { found: 0 }] = await db
    .select({ found: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), eq(transactions.merchant, exact)),
    );
  const merchant = found
    ? exact
    : (normalizeMerchant(input.merchant, input.merchant) ?? exact);
  const values = {
    categoryId: input.categoryId,
    subscriptionId: input.subscriptionId ?? null,
  };
  await db
    .insert(merchantRules)
    .values({ id: newId("rul"), userId, merchant, ...values })
    .onConflictDoUpdate({
      target: [merchantRules.userId, merchantRules.merchant],
      set: values,
    });
  const where = and(
    eq(transactions.userId, userId),
    eq(transactions.merchant, merchant),
    // Anything still without a category, plus what was not reviewed by hand
    input.includeReviewed
      ? undefined
      : or(isNull(transactions.reviewedAt), isNull(transactions.categoryId)),
  );
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(where);
  await db
    .update(transactions)
    .set({
      categoryId: input.categoryId,
      ...(input.subscriptionId !== undefined
        ? { subscriptionId: input.subscriptionId }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      reviewedAt: new Date(),
    })
    .where(where);
  return { merchant, updated: n };
}

/** Merchants still without category, by amount: what to classify first */
export async function uncategorizedMerchants(
  { db, userId }: FinanceContext,
  limit = 30,
) {
  const rows = await db
    .select({
      merchant: transactions.merchant,
      count: sql<number>`count(*)`,
      outCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} end), 0)`,
      inCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} end), 0)`,
      currency: transactions.currency,
      example: sql<string>`max(${transactions.description})`,
    })
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), isNull(transactions.categoryId)),
    )
    .groupBy(transactions.merchant, transactions.currency)
    .orderBy(sql`3 desc`)
    .limit(limit);
  return rows;
}

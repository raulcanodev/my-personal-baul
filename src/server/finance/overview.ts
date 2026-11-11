import { and, eq, gte, lt, sql } from "drizzle-orm";

import { categories, moneyAccounts, transactions } from "@/server/db/schema";
import { listAccounts } from "./accounts";
import { incomeSql, spentSql } from "./analytics";
import type { FinanceContext } from "./context";
import { getRates, toBase } from "./money";
import { listSubscriptions } from "./subscriptions";

const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(y!, m! - 1, 1), to: new Date(y!, m!, 1) };
};

/** Month summary: totals in EUR, spending by category, and the last six months */
export async function getOverview(ctx: FinanceContext, month: string) {
  const { db, userId } = ctx;
  const rates = await getRates();
  const { from, to } = monthRange(month);
  const sixMonthsAgo = new Date(from.getFullYear(), from.getMonth() - 5, 1);

  const [byCategory, history, accounts, subs, uncategorized] =
    await Promise.all([
      db
        .select({
          categoryId: transactions.categoryId,
          name: categories.name,
          color: categories.color,
          kind: categories.kind,
          currency: transactions.currency,
          inCents: incomeSql,
          outCents: spentSql,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.date, from),
            lt(transactions.date, to),
          ),
        )
        .groupBy(transactions.categoryId, transactions.currency),
      db
        .select({
          month: sql<string>`strftime('%Y-%m', ${transactions.date} / 1000, 'unixepoch')`,
          kind: categories.kind,
          currency: transactions.currency,
          inCents: incomeSql,
          outCents: spentSql,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.date, sixMonthsAgo),
            lt(transactions.date, to),
          ),
        )
        .groupBy(sql`1`, categories.kind, transactions.currency),
      listAccounts(ctx),
      listSubscriptions(ctx),
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .innerJoin(moneyAccounts, eq(transactions.accountId, moneyAccounts.id))
        .where(
          and(
            eq(transactions.userId, userId),
            sql`${transactions.categoryId} is null`,
          ),
        ),
    ]);

  // Transfers between my own accounts are neither income nor spending
  const counts = (kind: string | null) => kind !== "transfer";

  const categoryMap = new Map<
    string,
    { id: string | null; name: string; color: string; cents: number }
  >();
  let incomeCents = 0;
  let expenseCents = 0;
  for (const row of byCategory) {
    if (!counts(row.kind)) continue;
    const inBase = toBase(row.inCents, row.currency, rates);
    const outBase = toBase(row.outCents, row.currency, rates);
    incomeCents += inBase;
    expenseCents += outBase;
    if (outBase !== 0) {
      const key = row.categoryId ?? "none";
      const entry = categoryMap.get(key) ?? {
        id: row.categoryId,
        name: row.name ?? "Sin categoría",
        color: row.color ?? "#d6d3d1",
        cents: 0,
      };
      entry.cents += outBase;
      categoryMap.set(key, entry);
    }
  }

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() - 5 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const monthly = months.map((m) => {
    const rows = history.filter((h) => h.month === m && counts(h.kind));
    return {
      month: m,
      incomeCents: rows.reduce(
        (n, r) => n + toBase(r.inCents, r.currency, rates),
        0,
      ),
      expenseCents: rows.reduce(
        (n, r) => n + toBase(r.outCents, r.currency, rates),
        0,
      ),
    };
  });

  return {
    month,
    incomeCents,
    expenseCents,
    // A category whose refunds outweigh its purchases is not spending
    spendingByCategory: [...categoryMap.values()]
      .filter((c) => c.cents > 0)
      .sort((a, b) => b.cents - a.cents),
    monthly,
    totalBalanceCents: accounts.totalCents,
    balanceByScope: accounts.byScope,
    accountsCount: accounts.items.length,
    subscriptions: subs.summary,
    uncategorizedCount: uncategorized[0]?.count ?? 0,
  };
}

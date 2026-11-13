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

export const OVERVIEW_RANGES = [3, 6, 12] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

/**
 * Month summary: totals in EUR, spending by category, and the `range` months ending at `month`
 * (income, spending and spending per category for each), plus an end-of-month projection.
 */
export async function getOverview(
  ctx: FinanceContext,
  month: string,
  range: OverviewRange = 6,
) {
  const { db, userId } = ctx;
  const rates = await getRates();
  const { from, to } = monthRange(month);
  const rangeStart = new Date(
    from.getFullYear(),
    from.getMonth() - (range - 1),
    1,
  );

  const [byCategory, history, accounts, subs, uncategorized, pace, lending] =
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
            gte(transactions.date, rangeStart),
            lt(transactions.date, to),
          ),
        )
        .groupBy(sql`1`, transactions.categoryId, transactions.currency),
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
      monthPace(ctx, from, to, rates),
      moneyLent(ctx, rates),
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

  const months = Array.from({ length: range }, (_, i) => {
    const d = new Date(
      from.getFullYear(),
      from.getMonth() - (range - 1) + i,
      1,
    );
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  // Categories seen in the period, with their spending over the whole period
  const periodCategories = new Map<
    string,
    {
      key: string;
      id: string | null;
      name: string;
      color: string;
      cents: number;
    }
  >();
  const monthly = months.map((m) => {
    let incomeCents = 0;
    let expenseCents = 0;
    const byCategory: Record<string, number> = {};
    for (const r of history) {
      if (r.month !== m || !counts(r.kind)) continue;
      const inBase = toBase(r.inCents, r.currency, rates);
      const outBase = toBase(r.outCents, r.currency, rates);
      incomeCents += inBase;
      expenseCents += outBase;
      if (outBase === 0) continue;
      const key = r.categoryId ?? "none";
      byCategory[key] = (byCategory[key] ?? 0) + outBase;
      const c = periodCategories.get(key) ?? {
        key,
        id: r.categoryId,
        name: r.name ?? "Sin categoría",
        color: r.color ?? "#d6d3d1",
        cents: 0,
      };
      c.cents += outBase;
      periodCategories.set(key, c);
    }
    for (const k of Object.keys(byCategory))
      byCategory[k] = Math.max(0, Math.round(byCategory[k]!));
    return {
      month: m,
      incomeCents: Math.round(incomeCents),
      expenseCents: Math.round(expenseCents),
      byCategory,
    };
  });

  // Where this month will likely end: what is spent plus what a typical month still spends from
  // today to its end (or a straight line when there are no previous months to compare)
  const spentSoFar = pace.currentCents.at(-1) ?? 0;
  const projectedExpenseCents = !pace.isCurrent
    ? spentSoFar
    : pace.monthsCompared > 0
      ? spentSoFar +
        Math.max(
          0,
          (pace.typicalCents.at(-1) ?? 0) -
            (pace.typicalCents[pace.today - 1] ?? 0),
        )
      : Math.round((spentSoFar / Math.max(1, pace.today)) * pace.daysInMonth);

  return {
    month,
    incomeCents,
    expenseCents,
    // A category whose refunds outweigh its purchases is not spending
    spendingByCategory: [...categoryMap.values()]
      .filter((c) => c.cents > 0)
      .sort((a, b) => b.cents - a.cents),
    monthly,
    range,
    periodCategories: [...periodCategories.values()]
      .filter((c) => c.cents > 0)
      .sort((a, b) => b.cents - a.cents)
      .map((c) => ({ ...c, cents: Math.round(c.cents) })),
    projectedExpenseCents: Math.round(projectedExpenseCents),
    totalBalanceCents: accounts.totalCents,
    balanceByScope: accounts.byScope,
    accountsCount: accounts.items.length,
    subscriptions: subs.summary,
    uncategorizedCount: uncategorized[0]?.count ?? 0,
    pace,
    lending,
  };
}

const PACE_MONTHS = 6;
const dayKey = sql<string>`strftime('%Y-%m-%d', ${transactions.date} / 1000, 'unixepoch')`;

function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Spending so far this month, day by day, next to a typical month: for every day, the median of
 * what the previous months had spent by that same day. Transfers excluded, refunds netted,
 * same as "Gastos del mes".
 */
async function monthPace(
  { db, userId }: FinanceContext,
  from: Date,
  to: Date,
  rates: Record<string, number>,
) {
  const compareFrom = new Date(
    from.getFullYear(),
    from.getMonth() - PACE_MONTHS,
    1,
  );
  const rows = await db
    .select({
      day: dayKey,
      currency: transactions.currency,
      outCents: spentSql,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, compareFrom),
        lt(transactions.date, to),
        sql`coalesce(${categories.kind}, '') <> 'transfer'`,
      ),
    )
    .groupBy(dayKey, transactions.currency);

  // month -> day of month -> cents
  const byMonth = new Map<string, number[]>();
  for (const r of rows) {
    const month = r.day.slice(0, 7);
    const day = Number(r.day.slice(8, 10));
    const days = byMonth.get(month) ?? Array<number>(32).fill(0);
    days[day]! += toBase(r.outCents, r.currency, rates);
    byMonth.set(month, days);
  }
  const cumulative = (days: number[], length: number) => {
    let total = 0;
    return Array.from({ length }, (_, i) => (total += days[i + 1] ?? 0));
  };

  const month = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(
    from.getFullYear(),
    from.getMonth() + 1,
    0,
  ).getDate();
  const now = new Date();
  const isCurrent = now >= from && now < to;
  const today = isCurrent ? now.getDate() : daysInMonth;
  const current = cumulative(byMonth.get(month) ?? [], today).map(Math.round);

  const previous = [...byMonth.entries()].filter(([m]) => m < month);
  const curves = previous.map(([m, days]) => {
    const [y, mm] = m.split("-").map(Number);
    const length = new Date(y!, mm!, 0).getDate();
    const curve = cumulative(days, length);
    // A shorter month has spent all it will by its last day
    return Array.from(
      { length: daysInMonth },
      (_, i) => curve[Math.min(i, length - 1)]!,
    );
  });
  const typical = Array.from({ length: daysInMonth }, (_, i) =>
    Math.round(median(curves.map((c) => c[i]!))),
  );

  return {
    month,
    daysInMonth,
    /** Day of the month the "current" line reaches (today, or the last day for past months) */
    today,
    isCurrent,
    currentCents: current,
    typicalCents: typical,
    monthsCompared: curves.length,
  };
}

/**
 * Money lent and not yet back: movements in categories marked as lending, netted per person
 * (what went out minus what came back), all time. Only people who still owe something.
 */
async function moneyLent(
  { db, userId }: FinanceContext,
  rates: Record<string, number>,
) {
  const person = sql<string>`coalesce(${transactions.merchant}, lower(${transactions.counterparty}), lower(${transactions.description}))`;
  const rows = await db
    .select({
      key: person,
      name: sql<string | null>`max(${transactions.counterparty})`,
      currency: transactions.currency,
      cents: sql<number>`sum(${transactions.amountCents})`,
      lastOut: sql<
        number | null
      >`max(case when ${transactions.amountCents} < 0 then ${transactions.date} end)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.userId, userId), eq(categories.isLending, true)))
    .groupBy(person, transactions.currency);

  const people = new Map<
    string,
    { name: string; owedCents: number; lastLentAt: number | null }
  >();
  for (const r of rows) {
    const p = people.get(r.key) ?? {
      name: r.name ?? titleCase(r.key),
      owedCents: 0,
      lastLentAt: null,
    };
    // Out is negative: what is owed is the opposite of the net
    p.owedCents -= toBase(r.cents, r.currency, rates);
    if (r.lastOut && (!p.lastLentAt || r.lastOut > p.lastLentAt))
      p.lastLentAt = r.lastOut;
    people.set(r.key, p);
  }
  const owing = [...people.values()]
    .map((p) => ({ ...p, owedCents: Math.round(p.owedCents) }))
    .filter((p) => p.owedCents > 0)
    .sort((a, b) => b.owedCents - a.owedCents);
  return {
    hasMovements: rows.length > 0,
    totalCents: owing.reduce((n, p) => n + p.owedCents, 0),
    people: owing.map((p) => ({
      ...p,
      lastLentAt: p.lastLentAt ? new Date(p.lastLentAt).toISOString() : null,
    })),
  };
}

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

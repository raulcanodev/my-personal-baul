// Aggregated spending, so an agent never has to page through hundreds of transactions.
// Everything in EUR, transfers between own accounts excluded. "Ámbito" here is the account's
// scope (personal vs work/LLC money), which is what separates personal and company finances.
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";

import {
  categories,
  debts,
  moneyAccounts,
  transactions,
  type Scope,
} from "@/server/db/schema";
import type { FinanceContext } from "./context";
import { getRates, toBase } from "./money";

export type SpendingGroupBy =
  "category" | "merchant" | "month" | "account" | "scope";

const DAY_MS = 24 * 60 * 60 * 1000;
const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const notTransfer = sql`coalesce(${categories.kind}, '') <> 'transfer'`;

/**
 * Spending net of refunds: money back in an expense category (a returned order) lowers spending
 * instead of counting as income. Use with `categories` joined and transfers already excluded.
 */
export const spentSql = sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} when ${categories.kind} = 'expense' then -${transactions.amountCents} end), 0)`;
/** Income without refunds of expenses */
export const incomeSql = sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 and coalesce(${categories.kind}, '') <> 'expense' then ${transactions.amountCents} end), 0)`;

function baseWhere(userId: string, from: Date, to: Date, scope?: Scope) {
  const where: SQL[] = [
    eq(transactions.userId, userId),
    gte(transactions.date, from),
    lt(transactions.date, to),
    notTransfer,
  ];
  if (scope) where.push(eq(moneyAccounts.scope, scope));
  return and(...where);
}

const GROUP_KEY: Record<SpendingGroupBy, SQL> = {
  category: sql`coalesce(${categories.name}, 'Sin categoría')`,
  merchant: sql`coalesce(${transactions.merchant}, ${transactions.counterparty}, ${transactions.description})`,
  month: sql`strftime('%Y-%m', ${transactions.date} / 1000, 'unixepoch')`,
  account: sql`${moneyAccounts.name}`,
  scope: sql`${moneyAccounts.scope}`,
};

async function aggregate(
  { db, userId }: FinanceContext,
  from: Date,
  to: Date,
  groupBy: SpendingGroupBy,
  scope: Scope | undefined,
  rates: Record<string, number>,
) {
  const key = GROUP_KEY[groupBy];
  const rows = await db
    .select({
      key: sql<string>`${key}`,
      currency: transactions.currency,
      outCents: spentSql,
      inCents: incomeSql,
      oneOffCents: sql<number>`coalesce(sum(case when ${transactions.isOneOff} and ${transactions.amountCents} < 0 then -${transactions.amountCents} end), 0)`,
      outCount: sql<number>`sum(case when ${transactions.amountCents} < 0 then 1 else 0 end)`,
      inCount: sql<number>`sum(case when ${transactions.amountCents} > 0 and coalesce(${categories.kind}, '') <> 'expense' then 1 else 0 end)`,
    })
    .from(transactions)
    .innerJoin(moneyAccounts, eq(transactions.accountId, moneyAccounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(baseWhere(userId, from, to, scope))
    .groupBy(key, transactions.currency);
  const groups = new Map<
    string,
    {
      key: string;
      outCents: number;
      inCents: number;
      oneOffCents: number;
      outCount: number;
      inCount: number;
    }
  >();
  for (const r of rows) {
    const g = groups.get(r.key) ?? {
      key: r.key,
      outCents: 0,
      inCents: 0,
      oneOffCents: 0,
      outCount: 0,
      inCount: 0,
    };
    g.outCents += toBase(r.outCents, r.currency, rates);
    g.inCents += toBase(r.inCents, r.currency, rates);
    g.oneOffCents += toBase(r.oneOffCents, r.currency, rates);
    g.outCount += r.outCount;
    g.inCount += r.inCount;
    groups.set(r.key, g);
  }
  return groups;
}

export async function spendingAnalytics(
  ctx: FinanceContext,
  input: {
    from: string;
    to: string;
    groupBy: SpendingGroupBy;
    scope?: Scope;
    top?: number;
    compare?: boolean;
  },
) {
  const from = dayStart(input.from);
  const to = new Date(dayStart(input.to).getTime() + DAY_MS);
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);
  const rates = await getRates();

  const [current, previous] = await Promise.all([
    aggregate(ctx, from, to, input.groupBy, input.scope, rates),
    input.compare === false
      ? Promise.resolve(new Map() as Awaited<ReturnType<typeof aggregate>>)
      : aggregate(ctx, prevFrom, from, input.groupBy, input.scope, rates),
  ]);

  const totalOut = [...current.values()].reduce((n, g) => n + g.outCents, 0);
  const totalIn = [...current.values()].reduce((n, g) => n + g.inCents, 0);
  const totalOneOff = [...current.values()].reduce(
    (n, g) => n + g.oneOffCents,
    0,
  );
  const prevOut = [...previous.values()].reduce((n, g) => n + g.outCents, 0);
  const groups = [...current.values()]
    .sort((a, b) =>
      input.groupBy === "month"
        ? a.key.localeCompare(b.key)
        : b.outCents - a.outCents,
    )
    .slice(0, input.top ?? 25)
    .map((g) => {
      const prev = previous.get(g.key);
      return {
        key: g.key,
        spentCents: g.outCents,
        incomeCents: g.inCents,
        oneOffCents: g.oneOffCents,
        expenses: g.outCount,
        avgExpenseCents: g.outCount ? Math.round(g.outCents / g.outCount) : 0,
        shareOfSpending: totalOut
          ? Math.round((g.outCents / totalOut) * 1000) / 1000
          : 0,
        previousSpentCents: prev ? prev.outCents : 0,
        changeCents: g.outCents - (prev?.outCents ?? 0),
      };
    });

  // Biggest expenses of the period, and ones far above what that merchant usually charges
  const { db, userId } = ctx;
  const expenses = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      merchant: transactions.merchant,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      isOneOff: transactions.isOneOff,
      category: categories.name,
      account: moneyAccounts.name,
    })
    .from(transactions)
    .innerJoin(moneyAccounts, eq(transactions.accountId, moneyAccounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        baseWhere(userId, from, to, input.scope),
        lt(transactions.amountCents, 0),
      ),
    );
  const history = await db
    .select({
      merchant: transactions.merchant,
      currency: transactions.currency,
      avg: sql<number>`avg(-${transactions.amountCents})`,
      n: sql<number>`count(*)`,
    })
    .from(transactions)
    .innerJoin(moneyAccounts, eq(transactions.accountId, moneyAccounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        baseWhere(
          userId,
          new Date(from.getTime() - 180 * DAY_MS),
          from,
          input.scope,
        ),
        lt(transactions.amountCents, 0),
      ),
    )
    .groupBy(transactions.merchant, transactions.currency);
  const usual = new Map(history.map((h) => [`${h.merchant}|${h.currency}`, h]));
  const describe = (e: (typeof expenses)[number], usualCents?: number) => ({
    id: e.id,
    date: iso(e.date),
    description: e.description,
    merchant: e.merchant,
    amountCents: -e.amountCents,
    currency: e.currency,
    amountBaseCents: toBase(-e.amountCents, e.currency, rates),
    category: e.category,
    account: e.account,
    isOneOff: e.isOneOff,
    ...(usualCents ? { usualCents: Math.round(usualCents) } : {}),
  });
  const largest = [...expenses]
    .sort(
      (a, b) =>
        toBase(a.amountCents, a.currency, rates) -
        toBase(b.amountCents, b.currency, rates),
    )
    .slice(0, 10)
    .map((e) => describe(e));
  const unusual = expenses
    .map((e) => ({ e, h: usual.get(`${e.merchant}|${e.currency}`) }))
    .filter(
      ({ e, h }) =>
        h &&
        h.n >= 3 &&
        -e.amountCents > h.avg * 2.5 &&
        -e.amountCents - h.avg > 2000,
    )
    .slice(0, 10)
    .map(({ e, h }) => describe(e, h!.avg));

  return {
    period: {
      from: input.from,
      to: input.to,
      previousFrom: iso(prevFrom),
      previousTo: iso(new Date(from.getTime() - DAY_MS)),
    },
    currency: "EUR",
    totals: {
      spentCents: totalOut,
      oneOffCents: totalOneOff,
      recurringSpentCents: totalOut - totalOneOff,
      incomeCents: totalIn,
      netCents: totalIn - totalOut,
      previousSpentCents: prevOut,
      changeCents: totalOut - prevOut,
    },
    groups,
    largest,
    unusual,
  };
}

/**
 * Typical monthly income and variable spending over the last full months (EUR, no transfers,
 * no subscription charges, no one-off expenses, refunds netted): the baseline the forecast and
 * the scenarios start from. It is the median month, not the mean, so one unusual month (a car,
 * a move) does not set the pace for the next year; months with no movements at all (before the
 * bank was connected) are left out.
 */
export async function monthlyBaseline(
  { db, userId }: FinanceContext,
  months = 6,
  scope?: Scope,
) {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const rates = await getRates();
  const where: SQL[] = [
    eq(transactions.userId, userId),
    gte(transactions.date, from),
    lt(transactions.date, to),
    notTransfer,
  ];
  if (scope) where.push(eq(moneyAccounts.scope, scope));
  // Loan installments are projected from the debt itself, so the bank charges are left out here
  const debtMerchants = (
    await db
      .select({ merchant: debts.merchant })
      .from(debts)
      .where(and(eq(debts.userId, userId), eq(debts.isActive, true)))
  )
    .map((d) => d.merchant)
    .filter((m): m is string => !!m);
  const notDebt = debtMerchants.length
    ? sql`coalesce(${transactions.merchant}, '') not in (${sql.join(
        debtMerchants.map((m) => sql`${m}`),
        sql`, `,
      )})`
    : sql`1`;
  const month = sql<string>`strftime('%Y-%m', ${transactions.date} / 1000, 'unixepoch')`;
  const rows = await db
    .select({
      month,
      currency: transactions.currency,
      inCents: incomeSql,
      variableOutCents: sql<number>`coalesce(sum(case when ${transactions.subscriptionId} is null and not ${transactions.isOneOff} and ${notDebt} and (${transactions.amountCents} < 0 or ${categories.kind} = 'expense') then -${transactions.amountCents} end), 0)`,
      oneOffCents: sql<number>`coalesce(sum(case when ${transactions.isOneOff} and ${transactions.amountCents} < 0 then -${transactions.amountCents} end), 0)`,
    })
    .from(transactions)
    .innerJoin(moneyAccounts, eq(transactions.accountId, moneyAccounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...where))
    .groupBy(month, transactions.currency);

  const perMonth = new Map<string, { income: number; variable: number }>();
  let oneOff = 0;
  for (const r of rows) {
    const m = perMonth.get(r.month) ?? { income: 0, variable: 0 };
    m.income += toBase(r.inCents, r.currency, rates);
    m.variable += toBase(r.variableOutCents, r.currency, rates);
    perMonth.set(r.month, m);
    oneOff += toBase(r.oneOffCents, r.currency, rates);
  }
  const monthsWithData = [...perMonth.keys()].sort();
  const values = [...perMonth.values()];
  return {
    months: monthsWithData.length,
    from: monthsWithData[0] ? `${monthsWithData[0]}-01` : iso(from),
    to: iso(new Date(to.getTime() - DAY_MS)),
    avgIncomeCents: Math.round(median(values.map((v) => v.income))),
    avgVariableSpendingCents: Math.max(
      0,
      Math.round(median(values.map((v) => v.variable))),
    ),
    /** Each month's variable spending, so the median can be checked against the months */
    monthlyVariableCents: Object.fromEntries(
      monthsWithData.map((m) => [m, Math.round(perMonth.get(m)!.variable)]),
    ),
    /** One-off expenses of those months, left out of the average */
    excludedOneOffCents: oneOff,
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

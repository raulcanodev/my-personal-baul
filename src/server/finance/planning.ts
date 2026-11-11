// Planning data the bank cannot know: savings goals, budgets, debts and expected cash flows.
// Every list returns computed fields (progress, what is left, pace) so an agent can reason on
// them without recalculating.
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

import {
  budgets,
  categories,
  debts,
  moneyAccounts,
  type DebtKind,
  plannedFlows,
  savingsGoals,
  transactions,
  type FlowCycle,
  type Scope,
} from "@/server/db/schema";
import type { FinanceContext } from "./context";
import { newId } from "./ids";
import { getRates, todayIso, toBase } from "./money";

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDay = (iso: string) => new Date(`${iso}T12:00:00Z`);
const monthsBetween = (from: Date, to: Date) =>
  Math.max(0, (to.getTime() - from.getTime()) / (DAY_MS * 30.4375));

function owned<T extends { userId: unknown; id: unknown }>(
  table: T,
  userId: string,
  id: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return and(eq(table.id as any, id), eq(table.userId as any, userId));
}

/** Drops undefined keys so partial updates only touch what was sent */
const defined = <T extends object>(values: T) =>
  Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<T>;

// ── Savings goals ────────────────────────────────────────────────────────────

export type GoalInput = {
  name: string;
  targetCents: number;
  savedCents?: number;
  accountIds?: string[] | null;
  targetOn?: string | null;
  scope?: Scope;
  notes?: string | null;
  isArchived?: boolean;
};

export async function listGoals(
  { db, userId }: FinanceContext,
  includeArchived = false,
) {
  const [goals, accounts, rates] = await Promise.all([
    db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.userId, userId))
      .orderBy(asc(savingsGoals.name)),
    db.select().from(moneyAccounts).where(eq(moneyAccounts.userId, userId)),
    getRates(),
  ]);
  const now = new Date();
  return goals
    .filter((g) => includeArchived || !g.isArchived)
    .map((g) => {
      const linked = accounts.filter((a) => g.accountIds?.includes(a.id));
      const currentCents = linked.length
        ? linked.reduce(
            (n, a) => n + toBase(a.balanceCents, a.currency, rates),
            0,
          )
        : g.savedCents;
      const remainingCents = Math.max(0, g.targetCents - currentCents);
      const monthsLeft = g.targetOn
        ? monthsBetween(now, parseDay(g.targetOn))
        : null;
      return {
        ...g,
        linkedAccounts: linked.map((a) => a.name),
        currentCents,
        remainingCents,
        progress:
          g.targetCents > 0 ? Math.min(1, currentCents / g.targetCents) : 1,
        monthsLeft:
          monthsLeft === null ? null : Math.round(monthsLeft * 10) / 10,
        // What to put aside each month to arrive on time
        monthlyNeededCents:
          monthsLeft === null
            ? null
            : Math.ceil(remainingCents / Math.max(1, monthsLeft)),
      };
    });
}

export async function saveGoal(
  ctx: FinanceContext,
  input: Partial<GoalInput> & { id?: string },
) {
  const { id, ...values } = input;
  if (id) {
    await ctx.db
      .update(savingsGoals)
      .set(defined(values))
      .where(owned(savingsGoals, ctx.userId, id));
    return { id };
  }
  if (!values.name || values.targetCents === undefined) {
    throw new Error("Un objetivo necesita nombre e importe objetivo");
  }
  const goalId = newId("gol");
  await ctx.db.insert(savingsGoals).values({
    ...values,
    id: goalId,
    userId: ctx.userId,
    name: values.name,
    targetCents: values.targetCents,
  });
  return { id: goalId };
}

export async function deleteGoal({ db, userId }: FinanceContext, id: string) {
  await db.delete(savingsGoals).where(owned(savingsGoals, userId, id));
}

// ── Budgets ──────────────────────────────────────────────────────────────────

/** Budgets of a month (YYYY-MM): limit, spent (EUR, no transfers), what is left and the pace */
export async function listBudgets(
  { db, userId }: FinanceContext,
  month: string,
) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y!, m! - 1, 1);
  const to = new Date(y!, m!, 1);
  const [rows, spent, rates] = await Promise.all([
    db
      .select({
        budget: budgets,
        name: categories.name,
        scope: categories.scope,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(eq(budgets.userId, userId))
      .orderBy(asc(categories.name)),
    db
      .select({
        categoryId: transactions.categoryId,
        currency: transactions.currency,
        cents: sql<number>`coalesce(sum(-${transactions.amountCents}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.date, from),
          lt(transactions.date, to),
        ),
      )
      // Net: a refund in the category gives the budget back
      .groupBy(transactions.categoryId, transactions.currency),
    getRates(),
  ]);
  const now = new Date();
  const daysInMonth = (to.getTime() - from.getTime()) / DAY_MS;
  const elapsed =
    now < from
      ? 0
      : now >= to
        ? 1
        : (now.getTime() - from.getTime()) / DAY_MS / daysInMonth;
  return rows.map(({ budget, name, scope }) => {
    const spentCents = spent
      .filter((s) => s.categoryId === budget.categoryId)
      .reduce((n, s) => n + toBase(s.cents, s.currency, rates), 0);
    return {
      id: budget.id,
      categoryId: budget.categoryId,
      category: name,
      scope,
      monthlyCents: budget.monthlyCents,
      spentCents,
      remainingCents: budget.monthlyCents - spentCents,
      used: budget.monthlyCents > 0 ? spentCents / budget.monthlyCents : 0,
      // >1 means spending faster than the month is passing
      pace:
        elapsed > 0 && budget.monthlyCents > 0
          ? spentCents / budget.monthlyCents / elapsed
          : 0,
      monthElapsed: Math.round(elapsed * 100) / 100,
    };
  });
}

export async function saveBudget(
  ctx: FinanceContext,
  categoryId: string,
  monthlyCents: number,
) {
  const [category] = await ctx.db
    .select()
    .from(categories)
    .where(
      and(eq(categories.id, categoryId), eq(categories.userId, ctx.userId)),
    );
  if (!category) throw new Error("Categoría no encontrada");
  await ctx.db
    .insert(budgets)
    .values({ id: newId("bud"), userId: ctx.userId, categoryId, monthlyCents })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId],
      set: { monthlyCents },
    });
  return { categoryId, monthlyCents };
}

export async function deleteBudget(
  { db, userId }: FinanceContext,
  categoryId: string,
) {
  await db
    .delete(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)));
}

// ── Debts ────────────────────────────────────────────────────────────────────

export type DebtInput = {
  kind?: DebtKind;
  name: string;
  lender?: string | null;
  currency?: string;
  principalCents?: number | null;
  balanceCents: number;
  annualRateBps?: number;
  aprBps?: number | null;
  monthlyPaymentCents: number;
  creditLimitCents?: number | null;
  paymentDay?: number | null;
  startedOn?: string | null;
  endsOn?: string | null;
  merchant?: string | null;
  scope?: Scope;
  notes?: string | null;
  isActive?: boolean;
};

/**
 * Month-by-month amortization (French system): returns how many months are left and the
 * interest still to pay. `extraMonthlyCents` and `lumpSumCents` simulate paying faster.
 */
export function amortize(
  balanceCents: number,
  annualRateBps: number,
  monthlyPaymentCents: number,
  { extraMonthlyCents = 0, lumpSumCents = 0 } = {},
) {
  const rate = annualRateBps / 10000 / 12;
  let balance = Math.max(0, balanceCents - lumpSumCents);
  const payment = monthlyPaymentCents + extraMonthlyCents;
  let months = 0;
  let interest = 0;
  while (balance > 0 && months < 600) {
    const monthInterest = balance * rate;
    if (payment <= monthInterest)
      return { months: null, interestCents: null, paysOff: false };
    interest += monthInterest;
    balance = balance + monthInterest - payment;
    months++;
  }
  return { months, interestCents: Math.round(interest), paysOff: true };
}

export async function listDebts(
  { db, userId }: FinanceContext,
  includeInactive = false,
) {
  const rows = await db
    .select()
    .from(debts)
    .where(eq(debts.userId, userId))
    .orderBy(asc(debts.name));
  const rates = await getRates();
  return rows
    .filter((d) => includeInactive || d.isActive)
    .map((d) => {
      const plan = amortize(
        d.balanceCents,
        d.annualRateBps,
        d.monthlyPaymentCents,
      );
      const payoff =
        plan.months === null
          ? null
          : new Date(Date.now() + plan.months * 30.4375 * DAY_MS);
      return {
        ...d,
        annualRatePct: d.annualRateBps / 100,
        aprPct: d.aprBps === null ? null : d.aprBps / 100,
        // Credit cards: how much of the limit is in use
        creditUsed:
          d.kind === "credit_card" && d.creditLimitCents
            ? Math.round((d.balanceCents / d.creditLimitCents) * 1000) / 1000
            : null,
        balanceBaseCents: toBase(d.balanceCents, d.currency, rates),
        monthlyPaymentBaseCents: toBase(
          d.monthlyPaymentCents,
          d.currency,
          rates,
        ),
        monthsLeft: plan.months,
        interestLeftCents: plan.interestCents,
        payoffMonth: payoff ? payoff.toISOString().slice(0, 7) : null,
      };
    });
}

export async function saveDebt(
  ctx: FinanceContext,
  input: Partial<DebtInput> & { id?: string },
) {
  const { id, ...values } = input;
  if (id) {
    await ctx.db
      .update(debts)
      .set(defined(values))
      .where(owned(debts, ctx.userId, id));
    return { id };
  }
  if (
    !values.name ||
    values.balanceCents === undefined ||
    values.monthlyPaymentCents === undefined
  ) {
    throw new Error(
      "Una deuda necesita nombre, saldo pendiente y cuota mensual",
    );
  }
  const debtId = newId("dbt");
  await ctx.db.insert(debts).values({
    ...values,
    id: debtId,
    userId: ctx.userId,
    name: values.name,
    balanceCents: values.balanceCents,
    monthlyPaymentCents: values.monthlyPaymentCents,
  });
  return { id: debtId };
}

export async function deleteDebt({ db, userId }: FinanceContext, id: string) {
  await db.delete(debts).where(owned(debts, userId, id));
}

export async function simulateDebtPayoff(
  ctx: FinanceContext,
  id: string,
  extras: { extraMonthlyCents?: number; lumpSumCents?: number },
) {
  const [debt] = await ctx.db
    .select()
    .from(debts)
    .where(owned(debts, ctx.userId, id));
  if (!debt) throw new Error("Deuda no encontrada");
  const base = amortize(
    debt.balanceCents,
    debt.annualRateBps,
    debt.monthlyPaymentCents,
  );
  const faster = amortize(
    debt.balanceCents,
    debt.annualRateBps,
    debt.monthlyPaymentCents,
    extras,
  );
  return {
    debt: debt.name,
    currency: debt.currency,
    base,
    withExtras: faster,
    monthsSaved:
      base.months !== null && faster.months !== null
        ? base.months - faster.months
        : null,
    interestSavedCents:
      base.interestCents !== null && faster.interestCents !== null
        ? base.interestCents - faster.interestCents
        : null,
  };
}

// ── Planned flows (expected income/expenses) ─────────────────────────────────

export type PlannedFlowInput = {
  name: string;
  amountCents: number;
  currency?: string;
  cycle?: FlowCycle;
  nextOn: string;
  endsOn?: string | null;
  scope?: Scope;
  categoryId?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export async function listPlannedFlows(
  { db, userId }: FinanceContext,
  includeInactive = false,
) {
  const rows = await db
    .select()
    .from(plannedFlows)
    .where(eq(plannedFlows.userId, userId))
    .orderBy(asc(plannedFlows.nextOn));
  return rows.filter((f) => includeInactive || f.isActive);
}

export async function savePlannedFlow(
  ctx: FinanceContext,
  input: Partial<PlannedFlowInput> & { id?: string },
) {
  const { id, ...values } = input;
  if (id) {
    await ctx.db
      .update(plannedFlows)
      .set(defined(values))
      .where(owned(plannedFlows, ctx.userId, id));
    return { id };
  }
  if (!values.name || values.amountCents === undefined || !values.nextOn) {
    throw new Error("Un flujo previsto necesita nombre, importe y fecha");
  }
  const flowId = newId("flw");
  await ctx.db.insert(plannedFlows).values({
    ...values,
    id: flowId,
    userId: ctx.userId,
    name: values.name,
    amountCents: values.amountCents,
    nextOn: values.nextOn,
  });
  return { id: flowId };
}

export async function deletePlannedFlow(
  { db, userId }: FinanceContext,
  id: string,
) {
  await db.delete(plannedFlows).where(owned(plannedFlows, userId, id));
}

export { todayIso };

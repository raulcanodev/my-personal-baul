// Cash-flow forecast and "what if" scenarios. The server does the arithmetic from reliable data
// (balances, dated recurring items, recent averages); the model interprets and advises.
import { eq } from "drizzle-orm";

import {
  debts,
  plannedFlows,
  subscriptions,
  type FlowCycle,
  type Scope,
} from "@/server/db/schema";
import { listAccounts } from "./accounts";
import { monthlyBaseline } from "./analytics";
import type { FinanceContext } from "./context";
import { amortize } from "./planning";
import { getRates, monthlyCents, toBase } from "./money";

const DAY_MS = 24 * 60 * 60 * 1000;
const AVG_MONTH_DAYS = 30.4375;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (s: string) => new Date(`${s}T12:00:00Z`);

function addCycle(date: Date, cycle: Exclude<FlowCycle, "once">) {
  const d = new Date(date);
  if (cycle === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  if (cycle === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  if (cycle === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3);
  if (cycle === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/** Occurrences of a dated item between `from` and `until`, rolling past dates forward */
function occurrences(
  first: Date,
  cycle: FlowCycle,
  from: Date,
  until: Date,
  endsOn?: Date | null,
) {
  const out: Date[] = [];
  let d = new Date(first);
  if (cycle === "once") return d >= from && d <= until ? [d] : [];
  while (d < from) d = addCycle(d, cycle);
  const stop = endsOn && endsOn < until ? endsOn : until;
  while (d <= stop && out.length < 500) {
    out.push(d);
    d = addCycle(d, cycle);
  }
  return out;
}

type ForecastEvent = {
  date: string;
  source: "previsto" | "suscripción" | "deuda";
  name: string;
  amountCents: number;
  currency: string;
  amountBaseCents: number;
};

async function recurringItems(ctx: FinanceContext, scope?: Scope) {
  const { db, userId } = ctx;
  const [flows, subs, loans, rates] = await Promise.all([
    db.select().from(plannedFlows).where(eq(plannedFlows.userId, userId)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    db.select().from(debts).where(eq(debts.userId, userId)),
    getRates(),
  ]);
  const inScope = (s: Scope) => !scope || s === scope;
  return {
    rates,
    flows: flows.filter((f) => f.isActive && inScope(f.scope)),
    subs: subs.filter((s) => s.isActive && inScope(s.scope)),
    loans: loans.filter((d) => d.isActive && inScope(d.scope)),
  };
}

export async function forecastCashflow(
  ctx: FinanceContext,
  input: {
    horizons?: number[];
    scope?: Scope;
    includeVariableSpending?: boolean;
    includeHistoricalIncome?: boolean;
  },
) {
  const horizons = [
    ...new Set(input.horizons?.length ? input.horizons : [30, 60, 90]),
  ].sort((a, b) => a - b);
  const now = new Date();
  const until = new Date(now.getTime() + Math.max(...horizons) * DAY_MS);
  const [accounts, items, baseline] = await Promise.all([
    listAccounts(ctx),
    recurringItems(ctx, input.scope),
    monthlyBaseline(ctx, 6, input.scope),
  ]);
  const { rates } = items;
  const scopedAccounts = accounts.items.filter(
    (a) => !input.scope || a.scope === input.scope,
  );
  const currentCents = scopedAccounts.reduce(
    (n, a) => n + a.baseBalanceCents,
    0,
  );

  const events: ForecastEvent[] = [];
  const push = (
    date: Date,
    source: ForecastEvent["source"],
    name: string,
    amountCents: number,
    currency: string,
  ) =>
    events.push({
      date: iso(date),
      source,
      name,
      amountCents,
      currency,
      amountBaseCents: toBase(amountCents, currency, rates),
    });

  for (const f of items.flows) {
    for (const d of occurrences(
      parseDay(f.nextOn),
      f.cycle,
      now,
      until,
      f.endsOn ? parseDay(f.endsOn) : null,
    )) {
      push(d, "previsto", f.name, f.amountCents, f.currency);
    }
  }
  // Subscriptions without a next charge date are spread evenly (monthly cost per day)
  let undatedSubsMonthlyCents = 0;
  for (const s of items.subs) {
    if (!s.nextChargeOn) {
      undatedSubsMonthlyCents += toBase(
        monthlyCents(s.amountCents, s.cycle),
        s.currency,
        rates,
      );
      continue;
    }
    for (const d of occurrences(
      parseDay(s.nextChargeOn),
      s.cycle,
      now,
      until,
    )) {
      push(d, "suscripción", s.name, -s.amountCents, s.currency);
    }
  }
  for (const l of items.loans) {
    const left =
      amortize(l.balanceCents, l.annualRateBps, l.monthlyPaymentCents).months ??
      600;
    // Without a payment day, assume the next installment is a month from today
    let d = l.paymentDay
      ? new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            Math.min(l.paymentDay, 28),
            12,
          ),
        )
      : addCycle(
          new Date(
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth(),
              now.getUTCDate(),
              12,
            ),
          ),
          "monthly",
        );
    if (d < now) d = addCycle(d, "monthly");
    for (let i = 0; i < left && d <= until; i++, d = addCycle(d, "monthly")) {
      push(d, "deuda", l.name, -l.monthlyPaymentCents, l.currency);
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  const includeVariable = input.includeVariableSpending !== false;
  const variablePerDay = includeVariable
    ? baseline.avgVariableSpendingCents / AVG_MONTH_DAYS
    : 0;
  const historicalIncomePerDay = input.includeHistoricalIncome
    ? baseline.avgIncomeCents / AVG_MONTH_DAYS
    : 0;
  const undatedPerDay = undatedSubsMonthlyCents / AVG_MONTH_DAYS;

  const results = horizons.map((days) => {
    const end = iso(new Date(now.getTime() + days * DAY_MS));
    const inRange = events.filter((e) => e.date <= end);
    const plannedIn = inRange
      .filter((e) => e.amountBaseCents > 0)
      .reduce((n, e) => n + e.amountBaseCents, 0);
    const plannedOut = -inRange
      .filter((e) => e.amountBaseCents < 0)
      .reduce((n, e) => n + e.amountBaseCents, 0);
    const variableOut = Math.round(variablePerDay * days);
    const undatedOut = Math.round(undatedPerDay * days);
    const historicalIn = Math.round(historicalIncomePerDay * days);
    const expectedIncome = plannedIn + historicalIn;
    const expectedExpenses = plannedOut + variableOut + undatedOut;
    return {
      days,
      until: end,
      expectedIncomeCents: expectedIncome,
      expectedExpensesCents: expectedExpenses,
      projectedBalanceCents: currentCents + expectedIncome - expectedExpenses,
      breakdown: {
        plannedIncomeCents: plannedIn,
        historicalIncomeCents: historicalIn,
        datedExpensesCents: plannedOut,
        undatedSubscriptionsCents: undatedOut,
        variableSpendingCents: variableOut,
      },
    };
  });

  const stale = scopedAccounts.filter(
    (a) =>
      !a.balanceUpdatedAt ||
      now.getTime() - a.balanceUpdatedAt.getTime() > 2 * DAY_MS,
  );
  return {
    currency: "EUR",
    scope: input.scope ?? "todo",
    currentBalanceCents: currentCents,
    accounts: scopedAccounts.map((a) => ({
      name: a.name,
      scope: a.scope,
      balanceBaseCents: a.baseBalanceCents,
      updatedHoursAgo: a.balanceUpdatedAt
        ? Math.round((now.getTime() - a.balanceUpdatedAt.getTime()) / 36e5)
        : null,
    })),
    staleAccounts: stale.map((a) => a.name),
    forecasts: results,
    upcoming: events.slice(0, 40),
    baseline,
    assumptions: [
      "Saldos actuales convertidos a EUR al cambio de hoy; las transferencias entre cuentas propias no cuentan.",
      includeVariable
        ? `Gasto variable = mes típico (mediana) de los últimos ${baseline.months} meses completos (${baseline.from} a ${baseline.to}) sin suscripciones, cuotas de deudas, gastos puntuales ni transferencias y con los reembolsos restados, repartido por días.${baseline.excludedOneOffCents ? ` Quedan fuera ${Math.round(baseline.excludedOneOffCents / 100)} € de gastos puntuales.` : ""}`
        : "Sin gasto variable: solo lo previsto y lo recurrente.",
      input.includeHistoricalIncome
        ? "Ingresos = flujos previstos + media histórica de ingresos."
        : "Ingresos = solo flujos previstos (no se extrapolan ingresos pasados).",
      "Suscripciones sin fecha de próximo cobro se reparten como coste mensual por día.",
    ],
  };
}

export type ScenarioChange = {
  label: string;
  /** Monthly impact in EUR cents: positive = more money in, negative = more money out */
  monthlyCents: number;
  /** 1 = next month */
  fromMonth?: number;
  toMonth?: number;
};

export async function simulateScenario(
  ctx: FinanceContext,
  input: {
    months?: number;
    scope?: Scope;
    changes: ScenarioChange[];
    /** Replaces the baseline monthly income (e.g. 0 to model leaving a job) */
    replaceMonthlyIncomeCents?: number;
    includeHistoricalIncome?: boolean;
    startBalanceCents?: number;
  },
) {
  const months = Math.min(Math.max(input.months ?? 12, 1), 120);
  const [accounts, items, baseline] = await Promise.all([
    listAccounts(ctx),
    recurringItems(ctx, input.scope),
    monthlyBaseline(ctx, 6, input.scope),
  ]);
  const { rates } = items;
  const start =
    input.startBalanceCents ??
    accounts.items
      .filter((a) => !input.scope || a.scope === input.scope)
      .reduce((n, a) => n + a.baseBalanceCents, 0);

  const monthly = (amount: number, cycle: FlowCycle) =>
    cycle === "once" ? 0 : monthlyCents(amount, cycle);
  const recurringIncome = items.flows
    .filter((f) => f.amountCents > 0)
    .reduce(
      (n, f) => n + toBase(monthly(f.amountCents, f.cycle), f.currency, rates),
      0,
    );
  const recurringPlannedOut = items.flows
    .filter((f) => f.amountCents < 0)
    .reduce(
      (n, f) => n + toBase(monthly(-f.amountCents, f.cycle), f.currency, rates),
      0,
    );
  const subsOut = items.subs.reduce(
    (n, s) =>
      n + toBase(monthlyCents(s.amountCents, s.cycle), s.currency, rates),
    0,
  );
  const debtsOut = items.loans.reduce(
    (n, d) => n + toBase(d.monthlyPaymentCents, d.currency, rates),
    0,
  );

  // The baseline is "as things are"; replacing income only changes the scenario
  const baseIncome =
    recurringIncome +
    (input.includeHistoricalIncome ? baseline.avgIncomeCents : 0);
  const scenarioIncome = input.replaceMonthlyIncomeCents ?? baseIncome;
  const baseOut =
    subsOut +
    debtsOut +
    recurringPlannedOut +
    baseline.avgVariableSpendingCents;
  // One-off planned flows land in their month
  const now = new Date();
  const oneOff = (m: number) =>
    items.flows
      .filter((f) => f.cycle === "once")
      .filter((f) => {
        const d = parseDay(f.nextOn);
        const offset =
          (d.getUTCFullYear() - now.getUTCFullYear()) * 12 +
          d.getUTCMonth() -
          now.getUTCMonth();
        return offset === m;
      })
      .reduce((n, f) => n + toBase(f.amountCents, f.currency, rates), 0);

  let baseBalance = start;
  let scenarioBalance = start;
  let baseRunway: number | null = null;
  let scenarioRunway: number | null = null;
  const timeline = [];
  for (let m = 1; m <= months; m++) {
    const delta = input.changes
      .filter(
        (c) =>
          m >= (c.fromMonth ?? 1) &&
          (c.toMonth === undefined || m <= c.toMonth),
      )
      .reduce((n, c) => n + c.monthlyCents, 0);
    const extra = oneOff(m);
    baseBalance += baseIncome - baseOut + extra;
    scenarioBalance += scenarioIncome - baseOut + extra + delta;
    if (baseRunway === null && baseBalance < 0) baseRunway = m;
    if (scenarioRunway === null && scenarioBalance < 0) scenarioRunway = m;
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1),
    );
    timeline.push({
      month: date.toISOString().slice(0, 7),
      baselineBalanceCents: Math.round(baseBalance),
      scenarioBalanceCents: Math.round(scenarioBalance),
      scenarioDeltaCents: delta,
    });
  }

  const scenarioNet = (m: number) =>
    scenarioIncome -
    baseOut +
    input.changes
      .filter(
        (c) =>
          m >= (c.fromMonth ?? 1) &&
          (c.toMonth === undefined || m <= c.toMonth),
      )
      .reduce((n, c) => n + c.monthlyCents, 0);
  return {
    currency: "EUR",
    scope: input.scope ?? "todo",
    startBalanceCents: start,
    months,
    monthlyBaseline: {
      incomeCents: baseIncome,
      expensesCents: baseOut,
      netCents: baseIncome - baseOut,
      breakdown: {
        recurringPlannedIncomeCents: recurringIncome,
        historicalIncomeCents: input.includeHistoricalIncome
          ? baseline.avgIncomeCents
          : 0,
        subscriptionsCents: subsOut,
        debtPaymentsCents: debtsOut,
        recurringPlannedExpensesCents: recurringPlannedOut,
        variableSpendingCents: baseline.avgVariableSpendingCents,
      },
    },
    scenarioMonthlyNetFirstMonthCents: scenarioNet(1),
    changes: input.changes,
    result: {
      baselineEndBalanceCents: Math.round(baseBalance),
      scenarioEndBalanceCents: Math.round(scenarioBalance),
      differenceCents: Math.round(scenarioBalance - baseBalance),
      baselineMinBalanceCents: Math.min(
        start,
        ...timeline.map((t) => t.baselineBalanceCents),
      ),
      scenarioMinBalanceCents: Math.min(
        start,
        ...timeline.map((t) => t.scenarioBalanceCents),
      ),
      // First month the balance would go below zero (null = never within the horizon)
      baselineRunsOutInMonth: baseRunway,
      scenarioRunsOutInMonth: scenarioRunway,
    },
    timeline,
    baseline,
  };
}

import "server-only";
import { asc, desc, eq } from "drizzle-orm";

import type { Db } from "@/server/db";
import {
  budgets,
  categories,
  debts,
  merchantRules,
  moneyAccounts,
  plannedFlows,
  savingsGoals,
  subscriptions,
  transactions,
} from "@/server/db/schema";

/** Everything the user owns, as plain JSON (no bank API keys, no auth data) */
export async function exportAll(db: Db, userId: string) {
  const [accounts, txs, cats, subs, rules, goals, buds, loans, flows] =
    await Promise.all([
      db
        .select()
        .from(moneyAccounts)
        .where(eq(moneyAccounts.userId, userId))
        .orderBy(asc(moneyAccounts.name)),
      db
        .select({
          id: transactions.id,
          date: transactions.date,
          description: transactions.description,
          counterparty: transactions.counterparty,
          merchant: transactions.merchant,
          amountCents: transactions.amountCents,
          currency: transactions.currency,
          status: transactions.status,
          accountId: transactions.accountId,
          categoryId: transactions.categoryId,
          subscriptionId: transactions.subscriptionId,
          note: transactions.note,
          reviewedAt: transactions.reviewedAt,
        })
        .from(transactions)
        .where(eq(transactions.userId, userId))
        .orderBy(desc(transactions.date)),
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
      db.select().from(merchantRules).where(eq(merchantRules.userId, userId)),
      db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)),
      db.select().from(budgets).where(eq(budgets.userId, userId)),
      db.select().from(debts).where(eq(debts.userId, userId)),
      db.select().from(plannedFlows).where(eq(plannedFlows.userId, userId)),
    ]);
  return {
    exportedAt: new Date().toISOString(),
    amountsIn: "cents",
    accounts,
    transactions: txs,
    categories: cats,
    subscriptions: subs,
    merchantRules: rules,
    savingsGoals: goals,
    budgets: buds,
    debts: loans,
    plannedFlows: flows,
  };
}

const csvCell = (value: string | number | null | undefined) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Transactions as CSV (one row each, amounts in major units), ready for a spreadsheet */
export async function exportTransactionsCsv(db: Db, userId: string) {
  const data = await exportAll(db, userId);
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  const header = [
    "fecha",
    "concepto",
    "comercio",
    "importe",
    "moneda",
    "cuenta",
    "categoria",
    "estado",
    "nota",
  ];
  const rows = data.transactions.map((t) =>
    [
      t.date.toISOString().slice(0, 10),
      t.description,
      t.counterparty ?? t.merchant,
      (t.amountCents / 100).toFixed(2),
      t.currency,
      accountName.get(t.accountId),
      t.categoryId ? categoryName.get(t.categoryId) : "",
      t.status,
      t.note,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

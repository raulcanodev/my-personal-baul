// Bank connections and sync, following papra's syncBankTransactions/refreshAccountBalances, with
// two changes: one API key discovers all its accounts, and merchant rules replace the rule engine.
import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "@/server/db";
import {
  bankConnections,
  merchantRules,
  moneyAccounts,
  transactions,
  type BankProvider,
} from "@/server/db/schema";
import { recordBalance } from "./accounts";
import type { FinanceContext } from "./context";
import { newId } from "./ids";
import { decryptSecret, encryptSecret } from "./crypto";
import { normalizeMerchant } from "./merchant";
import { toCents } from "./money";
import { getBankProviderAdapter } from "./providers";

type Connection = typeof bankConnections.$inferSelect;

// Statements per D1 batch; a batch counts as one query against the per-request limit
const BATCH_SIZE = 50;
// Re-read a few days before the last sync: pending card payments settle late
const OVERLAP_MS = 3 * 24 * 60 * 60 * 1000;
// First sync window (papra used 6 months for Wise and 2 years for Mercury)
const FIRST_SYNC_MS = 365 * 24 * 60 * 60 * 1000;

export async function listConnections({ db, userId }: FinanceContext) {
  return db
    .select({
      id: bankConnections.id,
      provider: bankConnections.provider,
      name: bankConnections.name,
      isActive: bankConnections.isActive,
      lastSyncedAt: bankConnections.lastSyncedAt,
      lastError: bankConnections.lastError,
    })
    .from(bankConnections)
    .where(eq(bankConnections.userId, userId));
}

export async function addConnection(
  ctx: FinanceContext,
  input: { provider: BankProvider; name: string; apiKey: string },
  secret: string,
) {
  const adapter = getBankProviderAdapter(input.provider);
  const { isValid } = await adapter.validateApiKey({ apiKey: input.apiKey });
  if (!isValid) throw new Error("La API key no es válida para este banco");

  const id = newId("bnk");
  await ctx.db.insert(bankConnections).values({
    id,
    userId: ctx.userId,
    provider: input.provider,
    name: input.name,
    apiKeyEncrypted: await encryptSecret(input.apiKey, secret),
  });
  const [connection] = await ctx.db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.id, id));
  return syncConnection(ctx.db, connection!, secret);
}

export async function removeConnection(
  { db, userId }: FinanceContext,
  id: string,
) {
  // Accounts stay (with their history) as manual ones
  await db
    .delete(bankConnections)
    .where(and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)));
}

export async function syncConnectionById(
  { db, userId }: FinanceContext,
  id: string,
  secret: string,
  options: { fullSync?: boolean } = {},
) {
  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)));
  if (!connection) throw new Error("Conexión no encontrada");
  return syncConnection(db, connection, secret, options);
}

/** Balances for every account of the key, then new transactions for each account */
export async function syncConnection(
  db: Db,
  connection: Connection,
  secret: string,
  { fullSync = false }: { fullSync?: boolean } = {},
) {
  const adapter = getBankProviderAdapter(connection.provider);
  const startedAt = new Date();
  try {
    const apiKey = await decryptSecret(connection.apiKeyEncrypted, secret);

    // 1. Accounts and balances (new currencies/accounts show up on their own)
    const { balances } = await adapter.fetchBalances({ apiKey });
    const existing = await db
      .select()
      .from(moneyAccounts)
      .where(eq(moneyAccounts.connectionId, connection.id));
    const accounts = [...existing];
    for (const balance of balances) {
      let account = accounts.find(
        (a) => a.providerAccountId === balance.accountId,
      );
      if (!account) {
        const [created] = await db
          .insert(moneyAccounts)
          .values({
            id: newId("acc"),
            userId: connection.userId,
            connectionId: connection.id,
            providerAccountId: balance.accountId,
            name: balance.accountName,
            currency: balance.currency,
          })
          .returning();
        account = created!;
        accounts.push(account);
      }
      await recordBalance(db, account.id, toCents(balance.balance));
    }

    // 2. Transactions, idempotent thanks to (account_id, external_id)
    const rules = await db
      .select()
      .from(merchantRules)
      .where(eq(merchantRules.userId, connection.userId));
    const ruleByMerchant = new Map(rules.map((r) => [r.merchant, r]));
    const since =
      fullSync || !connection.lastSyncedAt
        ? new Date(Date.now() - FIRST_SYNC_MS)
        : new Date(connection.lastSyncedAt.getTime() - OVERLAP_MS);

    let syncedCount = 0;
    for (const account of accounts.filter((a) => !a.isArchived)) {
      const { transactions: fetched } = await adapter.fetchTransactions({
        apiKey,
        accountId: account.providerAccountId ?? undefined,
        fromDate: since,
      });
      const rows = fetched.map((t) => {
        const merchant = normalizeMerchant(t.counterparty, t.description);
        const rule = merchant ? ruleByMerchant.get(merchant) : undefined;
        return {
          id: newId("txn"),
          userId: connection.userId,
          accountId: account.id,
          externalId: t.externalId,
          date: t.date,
          description: t.description,
          counterparty: t.counterparty ?? null,
          merchant,
          amountCents: toCents(t.amount),
          currency: t.currency,
          status: t.status,
          categoryId: rule?.categoryId ?? null,
          subscriptionId: rule?.subscriptionId ?? null,
          raw: t.rawData,
        };
      });
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        if (chunk.length === 0) continue;
        const results = await db.batch(
          chunk.map((row) =>
            db
              .insert(transactions)
              .values(row)
              .onConflictDoUpdate({
                // A pending payment that settles keeps its category and review state
                target: [transactions.accountId, transactions.externalId],
                set: { status: row.status, amountCents: row.amountCents },
              }),
          ) as [never, ...never[]],
        );
        syncedCount += results.length;
      }
    }

    await db
      .update(bankConnections)
      .set({ lastSyncedAt: startedAt, lastError: null })
      .where(eq(bankConnections.id, connection.id));
    return { accounts: accounts.length, syncedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(bankConnections)
      .set({ lastError: message.slice(0, 500) })
      .where(eq(bankConnections.id, connection.id));
    throw new Error(`No se pudo sincronizar ${connection.name}: ${message}`);
  }
}

/** Daily cron: every active connection of every user, one failure does not stop the rest */
export async function syncAllConnections(db: Db, secret: string) {
  const connections = await db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.isActive, true));
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const connection of connections) {
    try {
      await syncConnection(db, connection, secret);
      results.push({ id: connection.id, ok: true });
    } catch (error) {
      results.push({ id: connection.id, ok: false, error: String(error) });
    }
  }
  return results;
}

/** Applies a merchant rule to the uncategorised transactions of that merchant */
export async function applyRuleToExisting(
  { db, userId }: FinanceContext,
  merchant: string,
  values: { categoryId: string | null; subscriptionId: string | null },
) {
  await db
    .update(transactions)
    .set(values)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.merchant, merchant),
        isNull(transactions.reviewedAt),
      ),
    );
}

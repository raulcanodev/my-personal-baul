// Bank connections and sync, following papra's syncBankTransactions/refreshAccountBalances, with
// two changes: one API key discovers all its accounts, and merchant rules replace the rule engine.
import { and, eq, isNull, like, or, sql } from "drizzle-orm";

import type { Db } from "@/server/db";
import {
  bankConnections,
  categories,
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
import { generateScaKeyPair } from "./providers/wise-sca";

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
      scaPublicKey: bankConnections.scaPublicKey,
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
  // Wise statements of EU/UK profiles need SCA: each connection gets its own signing key pair
  const sca = input.provider === "wise" ? await generateScaKeyPair() : null;
  await ctx.db.insert(bankConnections).values({
    id,
    userId: ctx.userId,
    provider: input.provider,
    name: input.name,
    apiKeyEncrypted: await encryptSecret(input.apiKey, secret),
    scaPrivateKeyEncrypted: sca
      ? await encryptSecret(sca.privateKeyPem, secret)
      : null,
    scaPublicKey: sca?.publicKeyPem ?? null,
  });
  const [connection] = await ctx.db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.id, id));
  // The connection exists from here on: a failed first sync is reported, not thrown, so
  // retrying from the UI does not create duplicates
  try {
    return { id, ...(await syncConnection(ctx.db, connection!, secret)) };
  } catch (error) {
    return {
      id,
      accounts: 0,
      syncedCount: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
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
    const signingKey = connection.scaPrivateKeyEncrypted
      ? await decryptSecret(connection.scaPrivateKeyEncrypted, secret)
      : undefined;

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
            kind: balance.kind ?? "main",
          })
          .returning();
        account = created!;
        accounts.push(account);
      } else if (balance.kind && account.kind !== balance.kind) {
        await db
          .update(moneyAccounts)
          .set({ kind: balance.kind })
          .where(eq(moneyAccounts.id, account.id));
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
    const errors: string[] = [];
    for (const account of accounts.filter((a) => !a.isArchived)) {
      let fetched: Awaited<
        ReturnType<typeof adapter.fetchTransactions>
      >["transactions"];
      try {
        ({ transactions: fetched } = await adapter.fetchTransactions({
          apiKey,
          accountId: account.providerAccountId ?? undefined,
          fromDate: since,
          signingKey,
        }));
      } catch (error) {
        // One blocked account does not stop the others
        errors.push(
          `${account.name}: ${explainSyncError(connection.provider, error)}`,
        );
        continue;
      }
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

    await classifyInternalTransfers(db, connection.userId);

    await db
      .update(bankConnections)
      .set({
        lastSyncedAt: startedAt,
        lastError: errors.length ? errors.join(" · ").slice(0, 1000) : null,
      })
      .where(eq(bankConnections.id, connection.id));
    return { accounts: accounts.length, syncedCount, errors };
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

/** For Wise connections created before SCA support: creates their signing key pair */
export async function ensureScaKey(
  { db, userId }: FinanceContext,
  id: string,
  secret: string,
) {
  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)));
  if (!connection) throw new Error("Conexión no encontrada");
  if (connection.scaPublicKey) return { publicKey: connection.scaPublicKey };
  const sca = await generateScaKeyPair();
  await db
    .update(bankConnections)
    .set({
      scaPrivateKeyEncrypted: await encryptSecret(sca.privateKeyPem, secret),
      scaPublicKey: sca.publicKeyPem,
    })
    .where(eq(bankConnections.id, id));
  return { publicKey: sca.publicKeyPem };
}

/**
 * Money moving between my own balances is neither income nor spending: currency conversions
 * ("Converted 270.01 USD to 239.91 EUR" shows up as −USD on one balance and +EUR on another) and
 * Wise jar moves ("Moved 400.00 EUR from Savings"). They get the transfer category, unless the
 * user already reviewed them.
 */
export async function classifyInternalTransfers(db: Db, userId: string) {
  let [transfer] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, "transfer")))
    .limit(1);
  if (!transfer) {
    [transfer] = await db
      .insert(categories)
      .values({
        id: newId("cat"),
        userId,
        name: "Transferencias",
        kind: "transfer",
        color: "#a8a29e",
      })
      .onConflictDoUpdate({
        target: [categories.userId, categories.name],
        set: { kind: "transfer" },
      })
      .returning({ id: categories.id });
  }
  await db
    .update(transactions)
    .set({ categoryId: transfer!.id })
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.categoryId),
        isNull(transactions.reviewedAt),
        or(
          like(transactions.description, "Converted % to %"),
          like(transactions.description, "Moved % from %"),
          like(transactions.description, "Moved % to %"),
          sql`json_extract(${transactions.raw}, '$.details.type') = 'CONVERSION'`,
        ),
      ),
    );
}

/**
 * Wise retired SCA request signing for personal accounts: personal tokens of EU/UK profiles can
 * read balances but not statements (business profiles still work). Say that instead of a 403.
 */
function explainSyncError(provider: BankProvider, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (provider === "wise" && /403|SCA/.test(message)) {
    return "Wise no deja leer movimientos de cuentas personales europeas por API, solo el saldo";
  }
  return message;
}

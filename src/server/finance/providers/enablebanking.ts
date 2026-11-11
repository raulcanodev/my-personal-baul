import type { BankProviderAdapter, ProviderTransaction } from "./types";

export type EnableCredentials = { appId: string; privateKey: string };
export type EnableAccount = {
  uid?: string;
  identification_hash: string;
  currency: string;
  name?: string;
  details?: string;
};
export type EnableSession = EnableCredentials & {
  sessionId: string;
  bank: { name: string; country: string };
  validUntil: string;
  accounts: EnableAccount[];
};
export type EnableBank = {
  name: string;
  country: string;
  maximum_consent_validity: number;
};
const encode = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export async function enableToken({ appId, privateKey }: EnableCredentials) {
  const now = Math.floor(Date.now() / 1000);
  const json = (value: unknown) =>
    encode(new TextEncoder().encode(JSON.stringify(value)));
  const input = `${json({ typ: "JWT", alg: "RS256", kid: appId })}.${json({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 300 })}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(privateKey.replace(/-----[^-]+-----|\s+/g, "")), (c) =>
      c.charCodeAt(0),
    ),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${encode(new Uint8Array(signature))}`;
}

export async function enableRequest<T>(
  credentials: EnableCredentials,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.enablebanking.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await enableToken(credentials)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(45000),
    cache: "no-store",
    // Workers support manual redirects; reject 3xx below without forwarding the JWT.
    redirect: "manual",
  });
  if (!response.ok) {
    // Never persist response bodies: they may contain bank details or authorization codes.
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "Enable Banking: acceso no autorizado. Renueva la conexión o revisa su activación.",
      );
    if (response.status === 429)
      throw new Error(
        "Enable Banking: límite temporal de consultas. Inténtalo más tarde.",
      );
    throw new Error(
      `Enable Banking: error ${response.status}. Inténtalo de nuevo o renueva la conexión.`,
    );
  }
  if (response.status === 204) return undefined as T;
  return await response.json();
}

export const enableAccountId = (account: EnableAccount) =>
  `${account.identification_hash}:${account.currency}`;
export function parseEnableSession(value: string): EnableSession {
  const session = JSON.parse(value) as EnableSession;
  if (
    !session.sessionId ||
    !session.appId ||
    !session.privateKey ||
    !Array.isArray(session.accounts)
  )
    throw new Error("Conexión Enable Banking incompleta");
  return session;
}

export type EnableTransaction = {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  status: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
  [key: string]: unknown;
};

export function mapEnableTransaction(
  row: EnableTransaction,
): ProviderTransaction {
  // transaction_id is NOT stable across requests according to Enable Banking.
  // Do not guess IDs: doing so silently merges genuine identical payments.
  if (!row.entry_reference)
    throw new Error(
      "El banco ha enviado movimientos sin identificador estable; no se importan para evitar duplicados.",
    );
  const date = new Date(
    row.booking_date ?? row.value_date ?? row.transaction_date ?? "",
  );
  const amount = Number(row.transaction_amount.amount);
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(date.getTime()) ||
    !["CRDT", "DBIT"].includes(row.credit_debit_indicator)
  )
    throw new Error(
      "El banco ha enviado un movimiento con fecha o importe no válido.",
    );
  const counterparty =
    row.credit_debit_indicator === "DBIT"
      ? row.creditor?.name
      : row.debtor?.name;
  const description = row.remittance_information?.join(" · ").trim();
  return {
    externalId: row.entry_reference,
    date,
    amount: Math.abs(amount) * (row.credit_debit_indicator === "DBIT" ? -1 : 1),
    currency: row.transaction_amount.currency,
    description: description?.length
      ? description
      : (counterparty ?? "Movimiento bancario"),
    counterparty,
    status: "posted",
    rawData: row,
  };
}

export function createEnableBankingAdapter(): BankProviderAdapter {
  async function sessionFor(apiKey: string) {
    const session = parseEnableSession(apiKey);
    if (Date.parse(session.validUntil) <= Date.now())
      throw new Error(
        "El permiso bancario ha caducado. Renueva la conexión en Ajustes → Bancos.",
      );
    return session;
  }
  return {
    async validateApiKey({ apiKey }) {
      const s = await sessionFor(apiKey);
      const status = await enableRequest<{ status: string }>(
        s,
        `/sessions/${encodeURIComponent(s.sessionId)}`,
      );
      return { isValid: status.status === "AUTHORIZED" };
    },
    async fetchAccounts({ apiKey }) {
      const s = await sessionFor(apiKey);
      return {
        accounts: s.accounts
          .filter((a) => a.uid)
          .map((a) => ({
            id: enableAccountId(a),
            name: a.name ?? s.bank.name,
          })),
      };
    },
    async fetchBalances({ apiKey }) {
      const s = await sessionFor(apiKey);
      const balances = [];
      for (const account of s.accounts.filter((a) => a.uid)) {
        const data = await enableRequest<{
          balances: {
            balance_type: string;
            balance_amount: { amount: string; currency: string };
          }[];
        }>(s, `/accounts/${encodeURIComponent(account.uid!)}/balances`);
        const matching = data.balances.filter(
          (b) => b.balance_amount.currency === account.currency,
        );
        const selected =
          ["ITBD", "CLBD", "ITAV", "CLAV", "PRCD", "OPBD"]
            .map((type) => matching.find((b) => b.balance_type === type))
            .find(Boolean) ?? matching[0];
        if (
          !selected ||
          !Number.isFinite(Number(selected.balance_amount.amount))
        )
          throw new Error(
            `No se ha recibido un saldo válido para ${account.currency}.`,
          );
        balances.push({
          accountId: enableAccountId(account),
          accountName: `${account.name ?? s.bank.name} · ${account.currency}`,
          balance: Number(selected.balance_amount.amount),
          currency: account.currency,
        });
      }
      return { balances };
    },
    async fetchTransactions({ apiKey, accountId, fromDate }) {
      const s = await sessionFor(apiKey);
      const account = s.accounts.find((a) => enableAccountId(a) === accountId);
      if (!account?.uid)
        throw new Error(
          "Esta cuenta no está incluida en el permiso bancario actual.",
        );
      const transactions: ProviderTransaction[] = [];
      const seen = new Set<string>();
      let continuation: string | undefined;
      for (let page = 0; page < 100; page++) {
        const query = new URLSearchParams({ transaction_status: "BOOK" });
        if (fromDate)
          query.set("date_from", fromDate.toISOString().slice(0, 10));
        if (continuation) query.set("continuation_key", continuation);
        const data = await enableRequest<{
          transactions: EnableTransaction[];
          continuation_key?: string;
        }>(
          s,
          `/accounts/${encodeURIComponent(account.uid)}/transactions?${query}`,
        );
        transactions.push(
          ...data.transactions
            .filter((t) => t.status === "BOOK")
            .map(mapEnableTransaction),
        );
        continuation = data.continuation_key;
        if (!continuation) return { transactions };
        if (seen.has(continuation))
          throw new Error(
            "El banco ha repetido una página de movimientos; sincronización cancelada.",
          );
        seen.add(continuation);
      }
      throw new Error(
        "Demasiadas páginas de movimientos. No se ha completado la sincronización.",
      );
    },
  };
}

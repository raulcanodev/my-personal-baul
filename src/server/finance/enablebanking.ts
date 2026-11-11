import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq, gt } from "drizzle-orm";
import { getBaseURL } from "@/server/better-auth/config";
import { bankConnections, verification } from "@/server/db/schema";
import { getEncryptionSecret, type FinanceContext } from "./context";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  enableRequest,
  parseEnableSession,
  type EnableBank,
  type EnableAccount,
  type EnableCredentials,
  type EnableSession,
} from "./providers/enablebanking";

export function enableConfiguration(
  userId?: string | null,
): EnableCredentials | null {
  const env = getCloudflareContext().env as unknown as Record<
    string,
    string | undefined
  >;
  const owner = env.ENABLE_BANKING_OWNER_USER_ID;
  if (
    !owner ||
    userId !== owner ||
    !env.ENABLE_BANKING_APP_ID ||
    !env.ENABLE_BANKING_PRIVATE_KEY
  )
    return null;
  return {
    appId: env.ENABLE_BANKING_APP_ID,
    privateKey: env.ENABLE_BANKING_PRIVATE_KEY,
  };
}

export async function listEnableBanks(
  credentials: EnableCredentials,
  country: string,
) {
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("País no válido");
  return (
    await enableRequest<{ aspsps: EnableBank[] }>(
      credentials,
      `/aspsps?country=${country}`,
    )
  ).aspsps.sort((a, b) => a.name.localeCompare(b.name));
}

export async function startEnableAuthorization(
  ctx: FinanceContext,
  credentials: EnableCredentials,
  country: string,
  bankName: string,
) {
  const banks = await listEnableBanks(credentials, country);
  const bank = banks.find((b) => b.name === bankName && b.country === country);
  if (!bank) throw new Error("El banco seleccionado no está disponible");
  if (!(bank.maximum_consent_validity > 0))
    throw new Error("El banco no ofrece un periodo de autorización válido");
  const validUntil = new Date(
    Date.now() +
      Math.min(bank.maximum_consent_validity, 180 * 86400) * 1000 -
      60000,
  ).toISOString();
  const state = crypto.randomUUID();
  // Single-use state, bound to the signed-in Baúl user. Never store the authorization code.
  await ctx.db.insert(verification).values({
    id: `enable:${state}`,
    identifier: `enable:${ctx.userId}`,
    value: JSON.stringify({ name: bank.name, country: bank.country }),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  try {
    const result = await enableRequest<{ url: string }>(credentials, "/auth", {
      method: "POST",
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp: { name: bank.name, country: bank.country },
        state,
        redirect_url: `${getBaseURL()}/api/banking/enablebanking/callback`,
        psu_type: "personal",
        language: "es",
      }),
    });
    const url = new URL(result.url);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "enablebanking.com" ||
        url.hostname.endsWith(".enablebanking.com")
      )
    )
      throw new Error("Destino de autorización no válido");
    return url.toString();
  } catch (error) {
    await ctx.db
      .delete(verification)
      .where(eq(verification.id, `enable:${state}`));
    throw error;
  }
}

export async function completeEnableAuthorization(
  ctx: FinanceContext,
  credentials: EnableCredentials,
  state: string,
  code: string | null,
) {
  const [pending] = await ctx.db
    .delete(verification)
    .where(
      and(
        eq(verification.id, `enable:${state}`),
        eq(verification.identifier, `enable:${ctx.userId}`),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!pending)
    throw new Error(
      "La autorización ha caducado o ya se ha utilizado. Inicia la conexión de nuevo.",
    );
  if (!code) throw new Error("La autorización bancaria se ha cancelado.");
  const bank = JSON.parse(pending.value) as { name: string; country: string };
  const result = await enableRequest<{
    session_id: string;
    accounts: EnableAccount[];
    access: { valid_until: string };
    aspsp: { name: string; country: string };
  }>(credentials, "/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (
    result.aspsp.name !== bank.name ||
    result.aspsp.country !== bank.country ||
    !result.session_id ||
    !Number.isFinite(Date.parse(result.access.valid_until))
  )
    throw new Error("El banco ha devuelto una autorización no válida.");
  const accounts = result.accounts.filter(
    (a) => a.uid && a.identification_hash && a.currency,
  );
  if (!accounts.length)
    throw new Error("No hay cuentas accesibles en esta autorización.");
  const session: EnableSession = {
    ...credentials,
    bank,
    sessionId: result.session_id,
    validUntil: result.access.valid_until,
    accounts,
  };
  // Stable bank connection and account hashes preserve history across consent renewals.
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([ctx.userId, bank.country, bank.name]),
    ),
  );
  const id = `eb_${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const secret = getEncryptionSecret();
  const [previous] = await ctx.db
    .select()
    .from(bankConnections)
    .where(
      and(eq(bankConnections.id, id), eq(bankConnections.userId, ctx.userId)),
    );
  await ctx.db
    .insert(bankConnections)
    .values({
      id,
      userId: ctx.userId,
      provider: "enablebanking",
      name: `${bank.name} (${bank.country})`,
      apiKeyEncrypted: await encryptSecret(JSON.stringify(session), secret),
    })
    .onConflictDoUpdate({
      target: bankConnections.id,
      set: {
        apiKeyEncrypted: await encryptSecret(JSON.stringify(session), secret),
        isActive: true,
        lastError: null,
        updatedAt: new Date(),
      },
    });
  if (previous) {
    try {
      const old = parseEnableSession(
        await decryptSecret(previous.apiKeyEncrypted, secret),
      );
      await enableRequest(
        old,
        `/sessions/${encodeURIComponent(old.sessionId)}`,
        { method: "DELETE" },
      );
    } catch {
      /* A superseded or expired session must not undo a successful renewal. */
    }
  }
  return id;
}

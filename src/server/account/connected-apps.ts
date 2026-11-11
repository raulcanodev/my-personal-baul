import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "@/server/db";
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "@/server/db/schema";

const parseList = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(" ").filter(Boolean);
  }
};

/** Agents (Claude, ChatGPT…) the user authorized through the MCP OAuth flow */
export async function listConnectedApps(db: Db, userId: string) {
  const rows = await db
    .select({
      clientId: oauthConsent.clientId,
      scopes: oauthConsent.scopes,
      grantedAt: oauthConsent.createdAt,
      name: oauthClient.name,
      uri: oauthClient.uri,
      icon: oauthClient.icon,
      lastUsedAt: sql<
        number | null
      >`(select max(${oauthRefreshToken.createdAt}) from ${oauthRefreshToken} where ${oauthRefreshToken.clientId} = ${oauthConsent.clientId} and ${oauthRefreshToken.userId} = ${userId} and ${oauthRefreshToken.revoked} is null)`,
      activeTokens: sql<number>`(select count(*) from ${oauthRefreshToken} where ${oauthRefreshToken.clientId} = ${oauthConsent.clientId} and ${oauthRefreshToken.userId} = ${userId} and ${oauthRefreshToken.revoked} is null)`,
    })
    .from(oauthConsent)
    .leftJoin(oauthClient, eq(oauthConsent.clientId, oauthClient.clientId))
    .where(eq(oauthConsent.userId, userId));
  return rows.map((r) => ({
    clientId: r.clientId,
    name: r.name ?? r.clientId,
    uri: r.uri,
    icon: r.icon,
    scopes: parseList(r.scopes),
    grantedAt: r.grantedAt,
    lastUsedAt: r.lastUsedAt ? new Date(r.lastUsedAt) : null,
    active: r.activeTokens > 0,
  }));
}

/**
 * Disconnects an agent for real: Better Auth's delete-consent only forgets the approval, the
 * app could keep refreshing. This also revokes its refresh (and opaque access) tokens, so it
 * cannot get new access tokens; the last JWT it holds expires within the hour.
 */
export async function disconnectApp(db: Db, userId: string, clientId: string) {
  const now = new Date();
  await db.batch([
    db
      .update(oauthRefreshToken)
      .set({ revoked: now })
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.clientId, clientId),
          isNull(oauthRefreshToken.revoked),
        ),
      ),
    db
      .update(oauthAccessToken)
      .set({ revoked: now })
      .where(
        and(
          eq(oauthAccessToken.userId, userId),
          eq(oauthAccessToken.clientId, clientId),
          isNull(oauthAccessToken.revoked),
        ),
      ),
    db
      .delete(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, userId),
          eq(oauthConsent.clientId, clientId),
        ),
      ),
  ]);
}

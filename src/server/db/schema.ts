import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Better Auth tables (email + password with the username plugin). Domain tables go below and
// always carry a userId: the app is single-user today but ready to open to friends.

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
};

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  ...timestamps,
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp_ms",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp_ms",
  }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

// ── Finances ────────────────────────────────────────────────────────────────
// Ported from papra's finances module, cleaned up: amounts are integer cents, categories are a
// real table (no free-text classification nor JSON tag lists), one API key can expose several
// accounts, and subscriptions link to transactions by id instead of a search query.

export const BANK_PROVIDERS = ["wise", "mercury"] as const;
export type BankProvider = (typeof BANK_PROVIDERS)[number];
export const CATEGORY_KINDS = ["expense", "income", "transfer"] as const;
export const SCOPES = ["personal", "work"] as const;
export type Scope = (typeof SCOPES)[number];
export const BILLING_CYCLES = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

const userRef = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: userRef(),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull().default("expense"),
    scope: text("scope", { enum: SCOPES }).notNull().default("personal"),
    color: text("color").notNull().default("#a8a29e"),
    ...timestamps,
  },
  (t) => [uniqueIndex("categories_user_name").on(t.userId, t.name)],
);

export const bankConnections = sqliteTable("bank_connections", {
  id: text("id").primaryKey(),
  userId: userRef(),
  provider: text("provider", { enum: BANK_PROVIDERS }).notNull(),
  name: text("name").notNull(),
  /** AES-GCM with BETTER_AUTH_SECRET, never returned to the client */
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  /** Wise SCA: private key (PKCS#8 PEM) encrypted like the API key; the public one is shown to paste in Wise */
  scaPrivateKeyEncrypted: text("sca_private_key_encrypted"),
  scaPublicKey: text("sca_public_key"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  ...timestamps,
});

export const moneyAccounts = sqliteTable(
  "money_accounts",
  {
    id: text("id").primaryKey(),
    userId: userRef(),
    /** null for manual accounts (cash, a savings account without API…) */
    connectionId: text("connection_id").references(() => bankConnections.id, {
      onDelete: "set null",
    }),
    providerAccountId: text("provider_account_id"),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("EUR"),
    scope: text("scope", { enum: SCOPES }).notNull().default("personal"),
    /** "savings" for Wise jars, shown nested under their profile */
    kind: text("kind", { enum: ["main", "savings"] })
      .notNull()
      .default("main"),
    balanceCents: integer("balance_cents").notNull().default(0),
    balanceUpdatedAt: integer("balance_updated_at", { mode: "timestamp_ms" }),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("money_accounts_provider").on(
      t.connectionId,
      t.providerAccountId,
    ),
  ],
);

export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => moneyAccounts.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD, one row per account and day */
    day: text("day").notNull(),
    balanceCents: integer("balance_cents").notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.day] })],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: userRef(),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    cycle: text("cycle", { enum: BILLING_CYCLES }).notNull().default("monthly"),
    scope: text("scope", { enum: SCOPES }).notNull().default("personal"),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    /** YYYY-MM-DD */
    nextChargeOn: text("next_charge_on"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    url: text("url"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("subscriptions_user").on(t.userId)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: userRef(),
    accountId: text("account_id")
      .notNull()
      .references(() => moneyAccounts.id, { onDelete: "cascade" }),
    /** Provider id; for manual entries a generated one */
    externalId: text("external_id").notNull(),
    date: integer("date", { mode: "timestamp_ms" }).notNull(),
    description: text("description").notNull(),
    counterparty: text("counterparty"),
    /** Normalised counterparty/description, what merchant rules match on */
    merchant: text("merchant"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["pending", "posted"] })
      .notNull()
      .default("posted"),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    note: text("note"),
    raw: text("raw", { mode: "json" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("transactions_account_external").on(t.accountId, t.externalId),
    index("transactions_user_date").on(t.userId, t.date),
    index("transactions_user_merchant").on(t.userId, t.merchant),
  ],
);

/** The only rule kind: "this merchant is this category (and this subscription)". */
export const merchantRules = sqliteTable(
  "merchant_rules",
  {
    id: text("id").primaryKey(),
    userId: userRef(),
    merchant: text("merchant").notNull(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "cascade",
    }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),
    ...timestamps,
  },
  (t) => [uniqueIndex("merchant_rules_user_merchant").on(t.userId, t.merchant)],
);

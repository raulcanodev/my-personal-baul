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

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

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
  /** "admin" sees the admin panel and creates invite codes; the first user is the admin */
  role: text("role", { enum: USER_ROLES }).notNull().default("user"),
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

/** Single-use codes the admin creates; signing up (after the first user) needs one */
export const inviteCodes = sqliteTable("invite_codes", {
  code: text("code").primaryKey(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Who it is for, so the admin remembers */
  note: text("note"),
  usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
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

export const BANK_PROVIDERS = ["wise", "mercury", "enablebanking"] as const;
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
    /** Money lent ("tiene que volver"): still spending, but the home page tracks what is owed */
    isLending: integer("is_lending", { mode: "boolean" })
      .notNull()
      .default(false),
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
    /** A one-off expense (lawyer, a repair): kept out of the monthly averages that forecasts use */
    isOneOff: integer("is_one_off", { mode: "boolean" })
      .notNull()
      .default(false),
    raw: text("raw", { mode: "json" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("transactions_account_external").on(t.accountId, t.externalId),
    index("transactions_user_date").on(t.userId, t.date),
    index("transactions_user_merchant").on(t.userId, t.merchant),
  ],
);

// ── Planning: goals, budgets, debts and expected cash flows ─────────────────

export const FLOW_CYCLES = [
  "once",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type FlowCycle = (typeof FLOW_CYCLES)[number];

/** A savings target. Progress comes from linked accounts (e.g. a Wise jar) or a manual amount. */
export const savingsGoals = sqliteTable("savings_goals", {
  id: text("id").primaryKey(),
  userId: userRef(),
  name: text("name").notNull(),
  targetCents: integer("target_cents").notNull(),
  /** Manual progress, used when no account is linked */
  savedCents: integer("saved_cents").notNull().default(0),
  /** JSON list of money_accounts ids whose balance counts as progress */
  accountIds: text("account_ids", { mode: "json" }).$type<string[]>(),
  /** YYYY-MM-DD */
  targetOn: text("target_on"),
  scope: text("scope", { enum: SCOPES }).notNull().default("personal"),
  notes: text("notes"),
  isArchived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
  ...timestamps,
});

/** Monthly spending limit for one category, in EUR */
export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: userRef(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    monthlyCents: integer("monthly_cents").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("budgets_user_category").on(t.userId, t.categoryId)],
);

export const DEBT_KINDS = [
  "loan",
  "credit_card",
  "financing",
  "other",
] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

/**
 * Financial obligations, kept apart from subscriptions: a loan installment is a commitment with
 * capital left and interest, Netflix is a cancellable recurring expense.
 * - loan / financing: amortizes with TIN and a fixed monthly payment
 * - credit_card: revolving balance against a limit; the payment can be a minimum
 */
export const debts = sqliteTable("debts", {
  id: text("id").primaryKey(),
  userId: userRef(),
  kind: text("kind", { enum: DEBT_KINDS }).notNull().default("loan"),
  name: text("name").notNull(),
  lender: text("lender"),
  currency: text("currency").notNull().default("EUR"),
  principalCents: integer("principal_cents"),
  balanceCents: integer("balance_cents").notNull(),
  /** TIN: nominal annual rate in basis points (5.25 % = 525), what amortization uses */
  annualRateBps: integer("annual_rate_bps").notNull().default(0),
  /** TAE: effective annual rate with fees, in basis points, to compare offers */
  aprBps: integer("apr_bps"),
  monthlyPaymentCents: integer("monthly_payment_cents").notNull(),
  /** Credit cards: credit limit */
  creditLimitCents: integer("credit_limit_cents"),
  /** Day of the month the installment is charged */
  paymentDay: integer("payment_day"),
  /** YYYY-MM-DD */
  startedOn: text("started_on"),
  /** YYYY-MM-DD */
  endsOn: text("ends_on"),
  scope: text("scope", { enum: SCOPES }).notNull().default("personal"),
  /** Merchant key of the bank charges (e.g. "quotanda"), to link the installments */
  merchant: text("merchant"),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

/**
 * Money expected to come in (positive) or go out (negative) that the bank cannot know yet:
 * an invoice to collect, rent, a salary, taxes. Feeds the cash-flow forecast.
 */
export const plannedFlows = sqliteTable("planned_flows", {
  id: text("id").primaryKey(),
  userId: userRef(),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("EUR"),
  cycle: text("cycle", { enum: FLOW_CYCLES }).notNull().default("once"),
  /** YYYY-MM-DD of the next (or only) occurrence */
  nextOn: text("next_on").notNull(),
  /** YYYY-MM-DD, last possible occurrence for recurring flows */
  endsOn: text("ends_on"),
  scope: text("scope", { enum: SCOPES }).notNull().default("personal"),
  categoryId: text("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

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

// ── OAuth for the MCP endpoint (Better Auth jwt + @better-auth/mcp) ──────────
// Shapes follow the plugins' own schema; lists and JSON are stored as text (the Drizzle adapter
// serializes them on SQLite).
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const bool = (name: string) => integer(name, { mode: "boolean" });

export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: ts("created_at").notNull(),
  expiresAt: ts("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClient = sqliteTable("oauth_client", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  clientDiscoveryId: text("client_discovery_id"),
  disabled: bool("disabled").default(false),
  skipConsent: bool("skip_consent"),
  enableEndSession: bool("enable_end_session"),
  subjectType: text("subject_type"),
  scopes: text("scopes"),
  clientCredentialsScopes: text("client_credentials_scopes"),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts"),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: text("redirect_uris").notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris"),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  backchannelLogoutSessionRequired: bool("backchannel_logout_session_required"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  applicationType: text("application_type"),
  jwks: text("jwks"),
  jwksUri: text("jwks_uri"),
  grantTypes: text("grant_types"),
  responseTypes: text("response_types"),
  requirePKCE: bool("require_pkce"),
  dpopBoundAccessTokens: bool("dpop_bound_access_tokens").default(false),
  referenceId: text("reference_id"),
  metadata: text("metadata"),
});

export const oauthResource = sqliteTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes"),
  customClaims: text("custom_claims"),
  dpopBoundAccessTokensRequired: bool(
    "dpop_bound_access_tokens_required",
  ).default(false),
  disabled: bool("disabled").default(false),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  policyVersion: integer("policy_version").default(1),
  metadata: text("metadata"),
});

export const oauthClientResource = sqliteTable("oauth_client_resource", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: "cascade" }),
  resourceId: text("resource_id")
    .notNull()
    .references(() => oauthResource.identifier, { onDelete: "cascade" }),
  metadata: text("metadata"),
  createdAt: ts("created_at"),
});

export const oauthRefreshToken = sqliteTable("oauth_refresh_token", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => session.id, {
    onDelete: "set null",
  }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requested_user_info_claims"),
  expiresAt: ts("expires_at"),
  createdAt: ts("created_at"),
  revoked: ts("revoked"),
  rotatedAt: ts("rotated_at"),
  rotationReplayResponse: text("rotation_replay_response"),
  rotationReplayExpiresAt: ts("rotation_replay_expires_at"),
  authTime: ts("auth_time"),
  confirmation: text("confirmation"),
  scopes: text("scopes").notNull(),
});

export const oauthAccessToken = sqliteTable("oauth_access_token", {
  id: text("id").primaryKey(),
  token: text("token").unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => session.id, {
    onDelete: "set null",
  }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requested_user_info_claims"),
  refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
    onDelete: "cascade",
  }),
  expiresAt: ts("expires_at"),
  createdAt: ts("created_at"),
  revoked: ts("revoked"),
  confirmation: text("confirmation"),
  scopes: text("scopes").notNull(),
});

export const oauthConsent = sqliteTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requested_user_info_claims"),
  scopes: text("scopes").notNull(),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
});

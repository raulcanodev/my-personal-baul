import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  BANK_PROVIDERS,
  BILLING_CYCLES,
  CATEGORY_KINDS,
  SCOPES,
} from "@/server/db/schema";
import {
  createManualAccount,
  listAccounts,
  updateAccount,
} from "@/server/finance/accounts";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/server/finance/categories";
import {
  addConnection,
  listConnections,
  removeConnection,
  syncConnectionById,
} from "@/server/finance/connections";
import {
  getEncryptionSecret,
  type FinanceContext,
} from "@/server/finance/context";
import { getOverview } from "@/server/finance/overview";
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  updateSubscription,
} from "@/server/finance/subscriptions";
import {
  categorizeTransaction,
  createManualTransaction,
  deleteManualTransaction,
  listTransactions,
} from "@/server/finance/transactions";

// Thin layer: every procedure is a call to a finance service, the same ones the MCP tools will use
const financeProcedure = protectedProcedure.use(({ ctx, next }) =>
  next({
    ctx: {
      finance: {
        db: ctx.db,
        userId: ctx.session.user.id,
      } satisfies FinanceContext,
    },
  }),
);

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scope = z.enum(SCOPES);
const currency = z.string().length(3).toUpperCase();

const subscriptionInput = z.object({
  name: z.string().min(1).max(120),
  amountCents: z.number().int().positive(),
  currency,
  cycle: z.enum(BILLING_CYCLES),
  scope,
  categoryId: z.string().nullish(),
  nextChargeOn: isoDay.nullish(),
  isActive: z.boolean().optional(),
  url: z
    .string()
    .url()
    .nullish()
    .or(z.literal("").transform(() => null)),
  notes: z.string().max(1000).nullish(),
});

export const financeRouter = createTRPCRouter({
  overview: financeProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(({ ctx, input }) => getOverview(ctx.finance, input.month)),

  categories: createTRPCRouter({
    list: financeProcedure.query(({ ctx }) => listCategories(ctx.finance)),
    create: financeProcedure
      .input(
        z.object({
          name: z.string().min(1).max(60),
          kind: z.enum(CATEGORY_KINDS),
          scope,
          color: z.string().optional(),
        }),
      )
      .mutation(({ ctx, input }) => createCategory(ctx.finance, input)),
    update: financeProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().min(1).max(60).optional(),
          kind: z.enum(CATEGORY_KINDS).optional(),
          scope: scope.optional(),
          color: z.string().optional(),
        }),
      )
      .mutation(({ ctx, input: { id, ...rest } }) =>
        updateCategory(ctx.finance, id, rest),
      ),
    delete: financeProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ ctx, input }) => deleteCategory(ctx.finance, input.id)),
  }),

  accounts: createTRPCRouter({
    list: financeProcedure.query(({ ctx }) => listAccounts(ctx.finance)),
    createManual: financeProcedure
      .input(
        z.object({
          name: z.string().min(1).max(80),
          currency,
          scope,
          balanceCents: z.number().int(),
        }),
      )
      .mutation(({ ctx, input }) => createManualAccount(ctx.finance, input)),
    update: financeProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().min(1).max(80).optional(),
          scope: scope.optional(),
          balanceCents: z.number().int().optional(),
          isArchived: z.boolean().optional(),
        }),
      )
      .mutation(({ ctx, input: { id, ...rest } }) =>
        updateAccount(ctx.finance, id, rest),
      ),
  }),

  connections: createTRPCRouter({
    list: financeProcedure.query(({ ctx }) => listConnections(ctx.finance)),
    add: financeProcedure
      .input(
        z.object({
          provider: z.enum(BANK_PROVIDERS),
          name: z.string().min(1).max(80),
          apiKey: z.string().min(8),
        }),
      )
      .mutation(({ ctx, input }) =>
        addConnection(ctx.finance, input, getEncryptionSecret()),
      ),
    sync: financeProcedure
      .input(z.object({ id: z.string(), fullSync: z.boolean().optional() }))
      .mutation(({ ctx, input }) =>
        syncConnectionById(ctx.finance, input.id, getEncryptionSecret(), {
          fullSync: input.fullSync,
        }),
      ),
    remove: financeProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ ctx, input }) => removeConnection(ctx.finance, input.id)),
  }),

  transactions: createTRPCRouter({
    list: financeProcedure
      .input(
        z.object({
          search: z.string().optional(),
          accountIds: z.array(z.string()).optional(),
          categoryIds: z.array(z.string()).optional(),
          uncategorized: z.boolean().optional(),
          scope: scope.optional(),
          direction: z.enum(["in", "out"]).optional(),
          from: isoDay.optional(),
          to: isoDay.optional(),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .query(({ ctx, input: { limit, offset, ...filters } }) =>
        listTransactions(ctx.finance, filters, { limit, offset }),
      ),
    categorize: financeProcedure
      .input(
        z.object({
          id: z.string(),
          categoryId: z.string().nullable(),
          subscriptionId: z.string().nullish(),
          note: z.string().max(500).nullish(),
          rememberMerchant: z.boolean().optional(),
        }),
      )
      .mutation(({ ctx, input }) => categorizeTransaction(ctx.finance, input)),
    createManual: financeProcedure
      .input(
        z.object({
          accountId: z.string(),
          date: isoDay,
          description: z.string().min(1).max(200),
          amountCents: z.number().int(),
          categoryId: z.string().nullish(),
          note: z.string().max(500).nullish(),
        }),
      )
      .mutation(({ ctx, input }) =>
        createManualTransaction(ctx.finance, input),
      ),
    deleteManual: financeProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ ctx, input }) =>
        deleteManualTransaction(ctx.finance, input.id),
      ),
  }),

  subscriptions: createTRPCRouter({
    list: financeProcedure.query(({ ctx }) => listSubscriptions(ctx.finance)),
    create: financeProcedure
      .input(subscriptionInput)
      .mutation(({ ctx, input }) => createSubscription(ctx.finance, input)),
    update: financeProcedure
      .input(subscriptionInput.partial().extend({ id: z.string() }))
      .mutation(({ ctx, input: { id, ...rest } }) =>
        updateSubscription(ctx.finance, id, rest),
      ),
    delete: financeProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ ctx, input }) => deleteSubscription(ctx.finance, input.id)),
  }),
});

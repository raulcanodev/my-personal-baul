import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  BANK_PROVIDERS,
  BILLING_CYCLES,
  CATEGORY_KINDS,
  DEBT_KINDS,
  FLOW_CYCLES,
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
  ensureScaKey,
  listConnections,
  removeConnection,
  syncConnectionById,
} from "@/server/finance/connections";
import {
  getEncryptionSecret,
  type FinanceContext,
} from "@/server/finance/context";
import { forecastCashflow } from "@/server/finance/forecast";
import { normalizeMerchant } from "@/server/finance/merchant";
import { getOverview } from "@/server/finance/overview";
import {
  deleteBudget,
  deleteDebt,
  deleteGoal,
  deletePlannedFlow,
  listBudgets,
  listDebts,
  listGoals,
  listPlannedFlows,
  saveBudget,
  saveDebt,
  saveGoal,
  savePlannedFlow,
} from "@/server/finance/planning";
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

const debtInput = z.object({
  kind: z.enum(DEBT_KINDS),
  name: z.string().min(1).max(120),
  lender: z.string().max(120).nullish(),
  currency,
  principalCents: z.number().int().min(0).nullish(),
  balanceCents: z.number().int().min(0),
  annualRateBps: z.number().int().min(0).max(10000),
  aprBps: z.number().int().min(0).max(20000).nullish(),
  monthlyPaymentCents: z.number().int().min(0),
  creditLimitCents: z.number().int().min(0).nullish(),
  paymentDay: z.number().int().min(1).max(31).nullish(),
  endsOn: isoDay.nullish(),
  merchant: z.string().max(120).nullish(),
  scope,
  notes: z.string().max(1000).nullish(),
  isActive: z.boolean(),
});

const goalInput = z.object({
  name: z.string().min(1).max(120),
  targetCents: z.number().int().positive(),
  savedCents: z.number().int().min(0).optional(),
  accountIds: z.array(z.string()).nullish(),
  targetOn: isoDay.nullish(),
  scope,
  notes: z.string().max(1000).nullish(),
  isArchived: z.boolean().optional(),
});

const flowInput = z.object({
  name: z.string().min(1).max(120),
  amountCents: z
    .number()
    .int()
    .refine((n) => n !== 0),
  currency,
  cycle: z.enum(FLOW_CYCLES),
  nextOn: isoDay,
  endsOn: isoDay.nullish(),
  scope,
  categoryId: z.string().nullish(),
  notes: z.string().max(1000).nullish(),
  isActive: z.boolean(),
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
          isLending: z.boolean().optional(),
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
    ensureScaKey: financeProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ ctx, input }) =>
        ensureScaKey(ctx.finance, input.id, getEncryptionSecret()),
      ),
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
          // Left out = unchanged, null = cleared
          categoryId: z.string().nullable().optional(),
          subscriptionId: z.string().nullish(),
          note: z.string().max(500).nullish(),
          isOneOff: z.boolean().optional(),
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
  planning: createTRPCRouter({
    forecast: financeProcedure
      .input(z.object({ scope: scope.optional() }))
      .query(({ ctx, input }) =>
        forecastCashflow(ctx.finance, {
          horizons: [30, 60, 90],
          scope: input.scope,
        }),
      ),
    debts: createTRPCRouter({
      list: financeProcedure.query(({ ctx }) => listDebts(ctx.finance, true)),
      save: financeProcedure
        .input(debtInput.extend({ id: z.string().optional() }))
        .mutation(({ ctx, input }) =>
          saveDebt(ctx.finance, {
            ...input,
            // The key bank lines use, so installments are not counted twice in the forecast
            merchant: input.merchant
              ? normalizeMerchant(input.merchant, input.merchant)
              : null,
          }),
        ),
      delete: financeProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ ctx, input }) => deleteDebt(ctx.finance, input.id)),
    }),
    goals: createTRPCRouter({
      list: financeProcedure.query(({ ctx }) => listGoals(ctx.finance, true)),
      save: financeProcedure
        .input(goalInput.extend({ id: z.string().optional() }))
        .mutation(({ ctx, input }) => saveGoal(ctx.finance, input)),
      delete: financeProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ ctx, input }) => deleteGoal(ctx.finance, input.id)),
    }),
    budgets: createTRPCRouter({
      list: financeProcedure
        .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
        .query(({ ctx, input }) => listBudgets(ctx.finance, input.month)),
      save: financeProcedure
        .input(
          z.object({
            categoryId: z.string(),
            monthlyCents: z.number().int().positive(),
          }),
        )
        .mutation(({ ctx, input }) =>
          saveBudget(ctx.finance, input.categoryId, input.monthlyCents),
        ),
      delete: financeProcedure
        .input(z.object({ categoryId: z.string() }))
        .mutation(({ ctx, input }) =>
          deleteBudget(ctx.finance, input.categoryId),
        ),
    }),
    flows: createTRPCRouter({
      list: financeProcedure.query(({ ctx }) =>
        listPlannedFlows(ctx.finance, true),
      ),
      save: financeProcedure
        .input(flowInput.extend({ id: z.string().optional() }))
        .mutation(({ ctx, input }) => savePlannedFlow(ctx.finance, input)),
      delete: financeProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ ctx, input }) => deletePlannedFlow(ctx.finance, input.id)),
    }),
  }),
});

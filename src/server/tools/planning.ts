// Analysis and planning tools: forecast, spending analytics, scenarios, goals, budgets,
// obligations (loans, credit cards), expected cash flows, categories and accounts.
// Reads come first: they are what conversations use most. Writes are separate tools so the
// client can ask before changing anything.
import { z } from "zod";

import {
  CATEGORY_KINDS,
  DEBT_KINDS,
  FLOW_CYCLES,
  SCOPES,
} from "@/server/db/schema";
import { updateAccount } from "@/server/finance/accounts";
import { spendingAnalytics } from "@/server/finance/analytics";
import { normalizeMerchant } from "@/server/finance/merchant";
import { createCategory, updateCategory } from "@/server/finance/categories";
import { forecastCashflow, simulateScenario } from "@/server/finance/forecast";
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
  simulateDebtPayoff,
} from "@/server/finance/planning";
import {
  deleteSubscription,
  listSubscriptions,
} from "@/server/finance/subscriptions";
import {
  categorizeMerchant,
  uncategorizedMerchants,
} from "@/server/finance/transactions";
import { defineTool } from "./types";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? null : Math.round(cents) / 100;
const toCents = (amount: number) => Math.round(amount * 100);
const optCents = (amount: number | null | undefined) =>
  amount === undefined ? undefined : amount === null ? null : toCents(amount);
const pctToBps = (pct: number | null | undefined) =>
  pct === undefined ? undefined : pct === null ? null : Math.round(pct * 100);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const month = z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM");
const scope = z.enum(SCOPES).describe("personal, o work = empresa/LLC/trabajo");
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export const planningTools = [
  // ── Analysis ───────────────────────────────────────────────────────────────
  defineTool({
    name: "prevision_tesoreria",
    title: "Previsión de tesorería",
    description:
      "Cuánto dinero habrá dentro de N días (por defecto 30, 60 y 90). Parte del saldo actual en EUR y suma lo fechado (flujos previstos como facturas o alquiler, suscripciones en su fecha de cobro, cuotas de préstamos) más el gasto variable al ritmo medio de los últimos 3 meses. Por defecto no extrapola ingresos pasados: los ingresos esperados se apuntan con guardar_flujo_previsto. Devuelve próximos movimientos, supuestos y cuentas con saldo desactualizado. Usa `ambito` para ver solo el dinero personal o solo el de la empresa.",
    risk: "read",
    input: z.object({
      dias: z.array(z.number().int().min(1).max(730)).optional(),
      ambito: scope.optional(),
      incluir_gasto_variable: z.boolean().default(true),
      incluir_ingresos_historicos: z.boolean().default(false),
    }),
    run: async (i, ctx) => {
      const f = await forecastCashflow(ctx, {
        horizons: i.dias,
        scope: i.ambito,
        includeVariableSpending: i.incluir_gasto_variable,
        includeHistoricalIncome: i.incluir_ingresos_historicos,
      });
      return {
        moneda: "EUR",
        ambito: f.scope,
        saldo_actual: money(f.currentBalanceCents),
        previsiones: f.forecasts.map((p) => ({
          dias: p.days,
          hasta: p.until,
          ingresos_esperados: money(p.expectedIncomeCents),
          gastos_esperados: money(p.expectedExpensesCents),
          saldo_previsto: money(p.projectedBalanceCents),
          desglose: {
            ingresos_previstos: money(p.breakdown.plannedIncomeCents),
            ingresos_historicos: money(p.breakdown.historicalIncomeCents),
            gastos_fechados: money(p.breakdown.datedExpensesCents),
            suscripciones_sin_fecha: money(
              p.breakdown.undatedSubscriptionsCents,
            ),
            gasto_variable: money(p.breakdown.variableSpendingCents),
          },
        })),
        proximos_movimientos: f.upcoming.map((e) => ({
          fecha: e.date,
          origen: e.source,
          concepto: e.name,
          importe: money(e.amountCents),
          moneda: e.currency,
          importe_eur: money(e.amountBaseCents),
        })),
        media_mensual: {
          meses: f.baseline.months,
          desde: f.baseline.from,
          hasta: f.baseline.to,
          ingresos: money(f.baseline.avgIncomeCents),
          gasto_variable: money(f.baseline.avgVariableSpendingCents),
          gastos_puntuales_excluidos: money(f.baseline.excludedOneOffCents),
        },
        cuentas: f.accounts.map((a) => ({
          nombre: a.name,
          ambito: a.scope,
          saldo_eur: money(a.balanceBaseCents),
          horas_desde_actualizacion: a.updatedHoursAgo,
        })),
        cuentas_desactualizadas: f.staleAccounts,
        supuestos: f.assumptions,
      };
    },
  }),

  defineTool({
    name: "analisis_gastos",
    title: "Análisis de gastos",
    description:
      "Gasto agregado de un periodo en EUR, sin transferencias entre cuentas propias y con los reembolsos restados (una devolución en una categoría de gasto baja el gasto, no es un ingreso). Separa el gasto puntual (marcado con categorizar_movimiento) del recurrente. Agrupado por categoria, comercio, mes, cuenta o ambito (personal/empresa según la cuenta). Compara con el periodo anterior de la misma duración, y lista los gastos más grandes y los inusuales (muy por encima de lo que ese comercio suele cobrar). Úsalo en vez de buscar_movimientos para preguntas de «en qué gasto», tendencias o comparaciones.",
    risk: "read",
    input: z.object({
      desde: isoDay.optional().describe("por defecto hace 30 días"),
      hasta: isoDay.optional().describe("por defecto hoy"),
      agrupar: z
        .enum(["categoria", "comercio", "mes", "cuenta", "ambito"])
        .default("categoria"),
      ambito: scope.optional(),
      top: z.number().int().min(1).max(100).default(25),
      comparar: z.boolean().default(true),
    }),
    run: async (i, ctx) => {
      const by = {
        categoria: "category",
        comercio: "merchant",
        mes: "month",
        cuenta: "account",
        ambito: "scope",
      } as const;
      const r = await spendingAnalytics(ctx, {
        from: i.desde ?? daysAgo(30),
        to: i.hasta ?? today(),
        groupBy: by[i.agrupar],
        scope: i.ambito,
        top: i.top,
        compare: i.comparar,
      });
      const tx = (e: (typeof r.largest)[number]) => ({
        id: e.id,
        fecha: e.date,
        concepto: e.description,
        comercio: e.merchant,
        importe: money(e.amountCents),
        moneda: e.currency,
        importe_eur: money(e.amountBaseCents),
        categoria: e.category,
        cuenta: e.account,
        puntual: e.isOneOff,
        ...(e.usualCents ? { habitual: money(e.usualCents) } : {}),
      });
      return {
        moneda: "EUR",
        periodo: { desde: r.period.from, hasta: r.period.to },
        periodo_anterior: {
          desde: r.period.previousFrom,
          hasta: r.period.previousTo,
        },
        totales: {
          gastado: money(r.totals.spentCents),
          gasto_puntual: money(r.totals.oneOffCents),
          gasto_recurrente: money(r.totals.recurringSpentCents),
          ingresado: money(r.totals.incomeCents),
          neto: money(r.totals.netCents),
          gastado_periodo_anterior: money(r.totals.previousSpentCents),
          variacion: money(r.totals.changeCents),
        },
        grupos: r.groups.map((g) => ({
          [i.agrupar]: g.key,
          gastado: money(g.spentCents),
          gasto_puntual: money(g.oneOffCents),
          ingresado: money(g.incomeCents),
          numero_gastos: g.expenses,
          gasto_medio: money(g.avgExpenseCents),
          porcentaje_del_gasto: g.shareOfSpending,
          gastado_periodo_anterior: money(g.previousSpentCents),
          variacion: money(g.changeCents),
        })),
        mayores_gastos: r.largest.map(tx),
        gastos_inusuales: r.unusual.map(tx),
      };
    },
  }),

  defineTool({
    name: "simular_escenario",
    title: "Simular escenario",
    description:
      "Proyecta el saldo mes a mes con y sin un cambio: «¿y si dejo el trabajo?» (sustituir_ingresos_mensuales = 0), «¿y si pago 425 € de alquiler?» (cambio de -425), «¿puedo con un coche de 250 €/mes?». La base mensual sale de ingresos (flujos previstos; la media de 3 meses solo con incluir_ingresos_historicos), suscripciones, cuotas de deudas y gasto variable medio. Devuelve saldo final, saldo mínimo y el mes en que se acabaría el dinero, en ambos casos. Importes en EUR; los cambios son mensuales (positivo = entra dinero).",
    risk: "read",
    input: z.object({
      cambios: z
        .array(
          z.object({
            concepto: z.string(),
            importe_mensual: z
              .number()
              .describe("EUR al mes: negativo gasto, positivo ingreso"),
            desde_mes: z
              .number()
              .int()
              .min(1)
              .default(1)
              .describe("1 = el mes que viene"),
            hasta_mes: z.number().int().min(1).optional(),
          }),
        )
        .default([]),
      meses: z.number().int().min(1).max(120).default(12),
      ambito: scope.optional(),
      sustituir_ingresos_mensuales: z.number().min(0).optional(),
      incluir_ingresos_historicos: z
        .boolean()
        .default(false)
        .describe(
          "suma la media de ingresos de los últimos 3 meses; por defecto solo cuentan los flujos previstos",
        ),
      saldo_inicial: z
        .number()
        .optional()
        .describe("por defecto el saldo actual"),
    }),
    run: async (i, ctx) => {
      const r = await simulateScenario(ctx, {
        months: i.meses,
        scope: i.ambito,
        changes: i.cambios.map((c) => ({
          label: c.concepto,
          monthlyCents: toCents(c.importe_mensual),
          fromMonth: c.desde_mes,
          toMonth: c.hasta_mes,
        })),
        replaceMonthlyIncomeCents:
          optCents(i.sustituir_ingresos_mensuales) ?? undefined,
        includeHistoricalIncome: i.incluir_ingresos_historicos,
        startBalanceCents: optCents(i.saldo_inicial) ?? undefined,
      });
      const b = r.monthlyBaseline;
      return {
        moneda: "EUR",
        ambito: r.scope,
        saldo_inicial: money(r.startBalanceCents),
        base_mensual: {
          ingresos: money(b.incomeCents),
          gastos: money(b.expensesCents),
          neto: money(b.netCents),
          desglose: {
            ingresos_recurrentes_previstos: money(
              b.breakdown.recurringPlannedIncomeCents,
            ),
            ingresos_media_historica: money(b.breakdown.historicalIncomeCents),
            suscripciones: money(b.breakdown.subscriptionsCents),
            cuotas_deudas: money(b.breakdown.debtPaymentsCents),
            gastos_recurrentes_previstos: money(
              b.breakdown.recurringPlannedExpensesCents,
            ),
            gasto_variable: money(b.breakdown.variableSpendingCents),
          },
        },
        neto_mensual_escenario: money(r.scenarioMonthlyNetFirstMonthCents),
        resultado: {
          saldo_final_base: money(r.result.baselineEndBalanceCents),
          saldo_final_escenario: money(r.result.scenarioEndBalanceCents),
          diferencia: money(r.result.differenceCents),
          saldo_minimo_base: money(r.result.baselineMinBalanceCents),
          saldo_minimo_escenario: money(r.result.scenarioMinBalanceCents),
          sin_dinero_en_mes_base: r.result.baselineRunsOutInMonth,
          sin_dinero_en_mes_escenario: r.result.scenarioRunsOutInMonth,
        },
        evolucion: r.timeline.map((t) => ({
          mes: t.month,
          saldo_base: money(t.baselineBalanceCents),
          saldo_escenario: money(t.scenarioBalanceCents),
        })),
      };
    },
  }),

  // ── Obligations: loans, financing, credit cards ───────────────────────────
  defineTool({
    name: "obligaciones_financieras",
    title: "Obligaciones financieras",
    description:
      "Lo que debes y lo que tienes comprometido cada mes: préstamos, financiaciones y tarjetas de crédito (capital pendiente, TIN, TAE, cuota, meses que quedan, intereses que quedan, fecha de fin, uso del límite de la tarjeta) y, aparte, el total mensual de suscripciones (gastos cancelables, que no son deuda). Totales en EUR.",
    risk: "read",
    input: z.object({ incluir_cerradas: z.boolean().default(false) }),
    run: async ({ incluir_cerradas }, ctx) => {
      const [list, subs] = await Promise.all([
        listDebts(ctx, incluir_cerradas),
        listSubscriptions(ctx),
      ]);
      const monthlyDebt = list
        .filter((d) => d.isActive)
        .reduce((n, d) => n + d.monthlyPaymentBaseCents, 0);
      return {
        moneda: "EUR",
        deuda_total: money(
          list
            .filter((d) => d.isActive)
            .reduce((n, d) => n + d.balanceBaseCents, 0),
        ),
        cuotas_al_mes: money(monthlyDebt),
        suscripciones_al_mes: money(subs.summary.monthlyCents),
        comprometido_al_mes: money(monthlyDebt + subs.summary.monthlyCents),
        deudas: list.map((d) => ({
          id: d.id,
          tipo: d.kind,
          nombre: d.name,
          entidad: d.lender,
          pendiente: money(d.balanceCents),
          moneda: d.currency,
          pendiente_eur: money(d.balanceBaseCents),
          capital_inicial: money(d.principalCents),
          tin: d.annualRatePct,
          tae: d.aprPct,
          cuota_mensual: money(d.monthlyPaymentCents),
          limite: money(d.creditLimitCents),
          uso_del_limite: d.creditUsed,
          dia_de_cobro: d.paymentDay,
          meses_restantes: d.monthsLeft,
          intereses_restantes: money(d.interestLeftCents),
          termina: d.payoffMonth ?? d.endsOn,
          comercio_en_banco: d.merchant,
          ambito: d.scope,
          activa: d.isActive,
          notas: d.notes,
        })),
      };
    },
  }),

  defineTool({
    name: "simular_amortizacion",
    title: "Simular amortización anticipada",
    description:
      "Para una deuda, cuántos meses e intereses te ahorras pagando de más: un pago único hoy y/o un extra cada mes. Útil para decidir entre amortizar o ahorrar.",
    risk: "read",
    input: z.object({
      deuda_id: z.string(),
      pago_unico: z.number().min(0).default(0),
      extra_mensual: z.number().min(0).default(0),
    }),
    run: async (i, ctx) => {
      const r = await simulateDebtPayoff(ctx, i.deuda_id, {
        lumpSumCents: toCents(i.pago_unico),
        extraMonthlyCents: toCents(i.extra_mensual),
      });
      return {
        deuda: r.debt,
        moneda: r.currency,
        actual: {
          meses: r.base.months,
          intereses: money(r.base.interestCents),
          se_paga: r.base.paysOff,
        },
        con_extras: {
          meses: r.withExtras.months,
          intereses: money(r.withExtras.interestCents),
          se_paga: r.withExtras.paysOff,
        },
        meses_ahorrados: r.monthsSaved,
        intereses_ahorrados: money(r.interestSavedCents),
      };
    },
  }),

  defineTool({
    name: "guardar_deuda",
    title: "Crear o actualizar deuda",
    description:
      "Registra un préstamo, financiación o tarjeta de crédito, o lo actualiza si pasas `id` (solo cambia lo que envíes). TIN y TAE en porcentaje (5.25). `comercio_en_banco` es el `comercio` con que aparecen las cuotas en buscar_movimientos (p. ej. quotanda): esos cargos salen de la media de gasto variable para no contar la cuota dos veces en la previsión. Si la cuota estaba apuntada como suscripción, desactívala con guardar_suscripcion para no contarla dos veces.",
    risk: "write",
    input: z.object({
      id: z.string().optional(),
      tipo: z
        .enum(DEBT_KINDS)
        .optional()
        .describe("loan, credit_card, financing u other"),
      nombre: z.string().min(1).max(120).optional(),
      entidad: z.string().max(120).nullable().optional(),
      moneda: z.string().length(3).toUpperCase().optional(),
      capital_inicial: z.number().min(0).nullable().optional(),
      pendiente: z.number().min(0).optional(),
      tin: z.number().min(0).max(100).optional(),
      tae: z.number().min(0).max(200).nullable().optional(),
      cuota_mensual: z.number().min(0).optional(),
      limite: z
        .number()
        .min(0)
        .nullable()
        .optional()
        .describe("tarjetas de crédito"),
      dia_de_cobro: z.number().int().min(1).max(31).nullable().optional(),
      inicio: isoDay.nullable().optional(),
      fin: isoDay.nullable().optional(),
      comercio_en_banco: z.string().nullable().optional(),
      ambito: scope.optional(),
      notas: z.string().max(1000).nullable().optional(),
      activa: z.boolean().optional(),
    }),
    run: async (i, ctx) =>
      saveDebt(ctx, {
        id: i.id,
        kind: i.tipo,
        name: i.nombre,
        lender: i.entidad,
        currency: i.moneda,
        principalCents: optCents(i.capital_inicial),
        balanceCents: optCents(i.pendiente) ?? undefined,
        annualRateBps: pctToBps(i.tin) ?? undefined,
        aprBps: pctToBps(i.tae),
        monthlyPaymentCents: optCents(i.cuota_mensual) ?? undefined,
        creditLimitCents: optCents(i.limite),
        paymentDay: i.dia_de_cobro,
        startedOn: i.inicio,
        endsOn: i.fin,
        merchant:
          i.comercio_en_banco === undefined || i.comercio_en_banco === null
            ? i.comercio_en_banco
            : normalizeMerchant(i.comercio_en_banco, i.comercio_en_banco),
        scope: i.ambito,
        notes: i.notas,
        isActive: i.activa,
      }),
  }),

  // ── Savings goals ──────────────────────────────────────────────────────────
  defineTool({
    name: "listar_objetivos",
    title: "Objetivos de ahorro",
    description:
      "Objetivos de ahorro con lo conseguido (saldo de las cuentas o huchas vinculadas, o un importe manual), lo que falta, el porcentaje, los meses hasta la fecha objetivo y cuánto habría que apartar cada mes para llegar. EUR.",
    risk: "read",
    input: z.object({ incluir_archivados: z.boolean().default(false) }),
    run: async ({ incluir_archivados }, ctx) =>
      (await listGoals(ctx, incluir_archivados)).map((g) => ({
        id: g.id,
        nombre: g.name,
        objetivo: money(g.targetCents),
        conseguido: money(g.currentCents),
        falta: money(g.remainingCents),
        progreso: Math.round(g.progress * 1000) / 1000,
        fecha_objetivo: g.targetOn,
        meses_restantes: g.monthsLeft,
        ahorro_mensual_necesario: money(g.monthlyNeededCents),
        cuentas_vinculadas: g.linkedAccounts,
        ambito: g.scope,
        notas: g.notes,
        archivado: g.isArchived,
      })),
  }),

  defineTool({
    name: "guardar_objetivo",
    title: "Crear o actualizar objetivo de ahorro",
    description:
      "Crea un objetivo (fondo de emergencia, independizarte…) o lo actualiza con `id`. El progreso se toma del saldo de `cuenta_ids` (p. ej. una hucha de Wise; ids en listar_cuentas) o, si no hay cuentas, de `ahorrado`. Importes en EUR.",
    risk: "write",
    input: z.object({
      id: z.string().optional(),
      nombre: z.string().min(1).max(120).optional(),
      objetivo: z.number().positive().optional(),
      ahorrado: z.number().min(0).optional(),
      cuenta_ids: z.array(z.string()).nullable().optional(),
      fecha_objetivo: isoDay.nullable().optional(),
      ambito: scope.optional(),
      notas: z.string().max(1000).nullable().optional(),
      archivado: z.boolean().optional(),
    }),
    run: async (i, ctx) =>
      saveGoal(ctx, {
        id: i.id,
        name: i.nombre,
        targetCents: optCents(i.objetivo) ?? undefined,
        savedCents: optCents(i.ahorrado) ?? undefined,
        accountIds: i.cuenta_ids,
        targetOn: i.fecha_objetivo,
        scope: i.ambito,
        notes: i.notas,
        isArchived: i.archivado,
      }),
  }),

  // ── Budgets ────────────────────────────────────────────────────────────────
  defineTool({
    name: "listar_presupuestos",
    title: "Presupuestos del mes",
    description:
      "Presupuesto mensual por categoría frente a lo gastado ese mes (EUR): lo que queda, el porcentaje usado y el ritmo (más de 1 = se está gastando más rápido de lo que avanza el mes).",
    risk: "read",
    input: z.object({
      mes: month.optional().describe("YYYY-MM; por defecto el actual"),
    }),
    run: async ({ mes }, ctx) => {
      const list = await listBudgets(
        ctx,
        mes ?? new Date().toISOString().slice(0, 7),
      );
      return {
        moneda: "EUR",
        presupuestos: list.map((b) => ({
          categoria_id: b.categoryId,
          categoria: b.category,
          presupuesto: money(b.monthlyCents),
          gastado: money(b.spentCents),
          queda: money(b.remainingCents),
          usado: Math.round(b.used * 1000) / 1000,
          ritmo: Math.round(b.pace * 100) / 100,
          mes_transcurrido: b.monthElapsed,
        })),
      };
    },
  }),

  defineTool({
    name: "guardar_presupuesto",
    title: "Fijar presupuesto",
    description:
      "Fija (o cambia) el límite mensual en EUR de una categoría. Ids en listar_categorias.",
    risk: "write",
    input: z.object({
      categoria_id: z.string(),
      importe_mensual: z.number().positive(),
    }),
    run: async (i, ctx) =>
      saveBudget(ctx, i.categoria_id, toCents(i.importe_mensual)),
  }),

  // ── Expected cash flows ────────────────────────────────────────────────────
  defineTool({
    name: "listar_flujos_previstos",
    title: "Flujos previstos",
    description:
      "Ingresos y gastos esperados que el banco aún no conoce (facturas por cobrar, nómina, alquiler, impuestos): importe (positivo entra, negativo sale), moneda, ciclo y próxima fecha. Son la base de prevision_tesoreria.",
    risk: "read",
    input: z.object({ incluir_inactivos: z.boolean().default(false) }),
    run: async ({ incluir_inactivos }, ctx) =>
      (await listPlannedFlows(ctx, incluir_inactivos)).map((f) => ({
        id: f.id,
        nombre: f.name,
        importe: money(f.amountCents),
        moneda: f.currency,
        ciclo: f.cycle,
        proxima_fecha: f.nextOn,
        termina: f.endsOn,
        ambito: f.scope,
        categoria_id: f.categoryId,
        notas: f.notes,
        activo: f.isActive,
      })),
  }),

  defineTool({
    name: "guardar_flujo_previsto",
    title: "Crear o actualizar flujo previsto",
    description:
      "Apunta un ingreso o gasto esperado: `importe` positivo si entra (una factura de 2.200 € el día 1 de cada mes) o negativo si sale (el IVA del trimestre). `ciclo`: once, weekly, monthly, quarterly o yearly. Con `id` actualiza.",
    risk: "write",
    input: z.object({
      id: z.string().optional(),
      nombre: z.string().min(1).max(120).optional(),
      importe: z
        .number()
        .refine((n) => n !== 0, "importe distinto de 0")
        .optional(),
      moneda: z.string().length(3).toUpperCase().optional(),
      ciclo: z.enum(FLOW_CYCLES).optional(),
      proxima_fecha: isoDay.optional(),
      termina: isoDay.nullable().optional(),
      ambito: scope.optional(),
      categoria_id: z.string().nullable().optional(),
      notas: z.string().max(1000).nullable().optional(),
      activo: z.boolean().optional(),
    }),
    run: async (i, ctx) =>
      savePlannedFlow(ctx, {
        id: i.id,
        name: i.nombre,
        amountCents: optCents(i.importe) ?? undefined,
        currency: i.moneda,
        cycle: i.ciclo,
        nextOn: i.proxima_fecha,
        endsOn: i.termina,
        scope: i.ambito,
        categoryId: i.categoria_id,
        notes: i.notas,
        isActive: i.activo,
      }),
  }),

  // ── Deleting ───────────────────────────────────────────────────────────────
  defineTool({
    name: "eliminar",
    title: "Eliminar",
    description:
      "Borra para siempre una suscripción, deuda, objetivo, presupuesto o flujo previsto. `id` es el de listar_suscripciones, obligaciones_financieras, listar_objetivos o listar_flujos_previstos; para un presupuesto, el id de su categoría. Si solo se ha cancelado, pagado o cumplido, mejor desactivarlo con su guardar_* (activa/activo=false, archivado=true) para conservar el histórico.",
    risk: "destructive",
    input: z.object({
      tipo: z.enum([
        "suscripcion",
        "deuda",
        "objetivo",
        "presupuesto",
        "flujo_previsto",
      ]),
      id: z.string(),
    }),
    run: async ({ tipo, id }, ctx) => {
      const remove = {
        suscripcion: deleteSubscription,
        deuda: deleteDebt,
        objetivo: deleteGoal,
        presupuesto: deleteBudget,
        flujo_previsto: deletePlannedFlow,
      }[tipo];
      await remove(ctx, id);
      return { tipo, id, eliminado: true };
    },
  }),

  // ── Categories, merchants and accounts ─────────────────────────────────────
  defineTool({
    name: "comercios_sin_categoria",
    title: "Comercios sin categoría",
    description:
      "Comercios con movimientos sin categoría, ordenados por lo que suman: por dónde empezar a clasificar. Después usa categorizar_comercio para clasificar todos los de un comercio de una vez.",
    risk: "read",
    input: z.object({ limite: z.number().int().min(1).max(100).default(30) }),
    run: async ({ limite }, ctx) =>
      (await uncategorizedMerchants(ctx, limite)).map((m) => ({
        comercio: m.merchant,
        movimientos: m.count,
        gastado: money(m.outCents),
        ingresado: money(m.inCents),
        moneda: m.currency,
        ejemplo: m.example,
      })),
  }),

  defineTool({
    name: "categorizar_comercio",
    title: "Categorizar comercio",
    description:
      "Categoriza todos los movimientos de un comercio de una vez (el `comercio` tal cual sale en buscar_movimientos o comercios_sin_categoria) y lo recuerda para los que lleguen después. Por defecto actualiza los que no tienen categoría y los no revisados; con incluir_revisados también cambia los que ya clasificaste a mano.",
    risk: "write",
    input: z.object({
      comercio: z.string().min(1),
      categoria_id: z.string().nullable(),
      suscripcion_id: z.string().nullable().optional(),
      incluir_revisados: z.boolean().default(false),
      nota: z.string().max(500).optional(),
    }),
    run: async (i, ctx) => {
      const r = await categorizeMerchant(ctx, {
        merchant: i.comercio,
        categoryId: i.categoria_id,
        subscriptionId: i.suscripcion_id,
        includeReviewed: i.incluir_revisados,
        note: i.nota,
      });
      return { comercio: r.merchant, movimientos_actualizados: r.updated };
    },
  }),

  defineTool({
    name: "guardar_categoria",
    title: "Crear o actualizar categoría",
    description:
      "Crea una categoría (Legal, Formación, Viajes…) o la cambia con `id`. `tipo`: expense, income o transfer (transfer no cuenta como gasto ni ingreso). `ambito`: personal o work.",
    risk: "write",
    input: z.object({
      id: z.string().optional(),
      nombre: z.string().min(1).max(60).optional(),
      tipo: z.enum(CATEGORY_KINDS).optional(),
      ambito: scope.optional(),
      color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .optional(),
    }),
    run: async (i, ctx) => {
      if (i.id) {
        await updateCategory(ctx, i.id, {
          name: i.nombre,
          kind: i.tipo,
          scope: i.ambito,
          color: i.color,
        });
        return { id: i.id, actualizada: true };
      }
      if (!i.nombre)
        throw new Error("Para crear una categoría hace falta nombre");
      const c = await createCategory(ctx, {
        name: i.nombre,
        kind: i.tipo ?? "expense",
        scope: i.ambito ?? "personal",
        color: i.color,
      });
      return { id: c.id, creada: true };
    },
  }),

  defineTool({
    name: "actualizar_cuenta",
    title: "Actualizar cuenta",
    description:
      "Cambia el nombre, el ámbito (personal o work = dinero de la empresa/LLC) o archiva una cuenta. El ámbito decide cómo se separa el dinero personal del de la empresa en los totales, la previsión y el análisis.",
    risk: "write",
    input: z.object({
      id: z.string(),
      nombre: z.string().min(1).max(80).optional(),
      ambito: scope.optional(),
      archivada: z.boolean().optional(),
    }),
    run: async (i, ctx) => {
      await updateAccount(ctx, i.id, {
        name: i.nombre,
        scope: i.ambito,
        isArchived: i.archivada,
      });
      return { id: i.id, actualizada: true };
    },
  }),
];

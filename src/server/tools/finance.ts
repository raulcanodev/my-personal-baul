// Finance tools: thin wrappers over src/server/finance, the same services the app uses.
// Amounts go in and out in major units (12.5 = 12,50 €) with their currency: easier for a model
// than cents. Totals are in EUR.
import { z } from "zod";

import { BILLING_CYCLES, SCOPES } from "@/server/db/schema";
import { listAccounts } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import {
  listConnections,
  syncConnectionById,
} from "@/server/finance/connections";
import { getOverview } from "@/server/finance/overview";
import {
  createSubscription,
  listSubscriptions,
  updateSubscription,
} from "@/server/finance/subscriptions";
import {
  categorizeTransaction,
  createManualTransaction,
  listTransactions,
} from "@/server/finance/transactions";
import { defineTool } from "./types";

const money = (cents: number) => Math.round(cents) / 100;
const toCents = (amount: number) => Math.round(amount * 100);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const currentMonth = () => new Date().toISOString().slice(0, 7);

export const financeTools = [
  defineTool({
    name: "resumen_mes",
    title: "Resumen del mes",
    description:
      "Resumen financiero de un mes: dinero total actual en EUR, ingresos y gastos del mes (sin transferencias entre cuentas propias; los reembolsos restan del gasto en vez de contar como ingreso), gasto por categoría, evolución de los últimos 6 meses, coste mensual de suscripciones (personal y trabajo) y cuántos movimientos quedan sin categoría. Úsalo para preguntas generales como «¿cuánto he gastado este mes?».",
    risk: "read",
    input: z.object({
      mes: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .describe("YYYY-MM; por defecto el mes actual"),
    }),
    run: async ({ mes }, ctx) => {
      const o = await getOverview(ctx, mes ?? currentMonth());
      return {
        mes: o.month,
        moneda: "EUR",
        dinero_total: money(o.totalBalanceCents),
        dinero_por_ambito: {
          personal: money(o.balanceByScope.personal),
          trabajo: money(o.balanceByScope.work),
        },
        ingresos: money(o.incomeCents),
        gastos: money(o.expenseCents),
        gasto_por_categoria: o.spendingByCategory.map((c) => ({
          categoria_id: c.id,
          categoria: c.name,
          importe: money(c.cents),
        })),
        ultimos_meses: o.monthly.map((m) => ({
          mes: m.month,
          ingresos: money(m.incomeCents),
          gastos: money(m.expenseCents),
        })),
        suscripciones_al_mes: {
          total: money(o.subscriptions.monthlyCents),
          personal: money(o.subscriptions.personalMonthlyCents),
          trabajo: money(o.subscriptions.workMonthlyCents),
        },
        movimientos_sin_categoria: o.uncategorizedCount,
      };
    },
  }),

  defineTool({
    name: "buscar_movimientos",
    title: "Buscar movimientos",
    description:
      "Lista movimientos bancarios, del más reciente al más antiguo, con filtros. `texto` busca cada palabra en concepto, comercio, nota, cuenta y categoría; un número también busca por importe (36,80 o 36.80). Devuelve el total de coincidencias y entradas/salidas en EUR sin transferencias. Usa `sin_categoria` para encontrar lo que falta por clasificar.",
    risk: "read",
    input: z.object({
      texto: z.string().optional(),
      desde: isoDay.optional(),
      hasta: isoDay.optional(),
      cuenta_ids: z.array(z.string()).optional(),
      categoria_ids: z.array(z.string()).optional(),
      sin_categoria: z.boolean().optional(),
      ambito: z
        .enum(SCOPES)
        .optional()
        .describe("ámbito de la categoría: personal o work (trabajo)"),
      tipo: z.enum(["ingresos", "gastos"]).optional(),
      limite: z.number().int().min(1).max(200).default(50),
      desplazamiento: z.number().int().min(0).default(0),
    }),
    run: async (i, ctx) => {
      const r = await listTransactions(
        ctx,
        {
          search: i.texto,
          from: i.desde,
          to: i.hasta,
          accountIds: i.cuenta_ids,
          categoryIds: i.categoria_ids,
          uncategorized: i.sin_categoria,
          scope: i.ambito,
          direction:
            i.tipo === "ingresos"
              ? "in"
              : i.tipo === "gastos"
                ? "out"
                : undefined,
        },
        { limit: i.limite, offset: i.desplazamiento },
      );
      return {
        total: r.count,
        entradas_eur: money(r.inCents),
        salidas_eur: money(r.outCents),
        movimientos: r.items.map((t) => ({
          id: t.id,
          fecha: t.date.toISOString().slice(0, 10),
          concepto: t.description,
          // The key merchant rules use (categorizar_comercio, comercio_en_banco)
          comercio: t.merchant,
          contraparte: t.counterparty,
          importe: money(t.amountCents),
          moneda: t.currency,
          cuenta: t.accountName,
          categoria_id: t.categoryId,
          categoria: t.categoryName,
          revisado: t.reviewedAt !== null,
          puntual: t.isOneOff,
          nota: t.note,
        })),
      };
    },
  }),

  defineTool({
    name: "categorizar_movimiento",
    title: "Categorizar movimiento",
    description:
      "Edita un movimiento: categoría, suscripción, nota (para qué fue la compra) o si es un gasto `puntual`. Lo que no envíes se queda como está; null lo borra. Marca puntual=true los gastos extraordinarios que no se repiten (abogado, una reparación, una multa): siguen contando en el gasto del mes, pero no en la media mensual con la que se hacen la previsión y los escenarios. Con `recordar_comercio` (por defecto sí, y solo si envías categoria_id) la categoría se guarda para ese comercio y se aplica a sus movimientos sin revisar y a los que lleguen; pon recordar_comercio=false en tiendas donde se compra de todo (Amazon, AliExpress, El Corte Inglés…) o cuando esta compra es una excepción. Ids de categoría en listar_categorias.",
    risk: "write",
    input: z.object({
      id: z.string(),
      categoria_id: z.string().nullable().optional(),
      suscripcion_id: z.string().nullable().optional(),
      puntual: z.boolean().optional(),
      recordar_comercio: z.boolean().default(true),
      nota: z.string().max(500).nullable().optional(),
    }),
    run: async (i, ctx) => {
      await categorizeTransaction(ctx, {
        id: i.id,
        categoryId: i.categoria_id,
        subscriptionId: i.suscripcion_id,
        note: i.nota,
        isOneOff: i.puntual,
        rememberMerchant: i.recordar_comercio,
      });
      return { ok: true };
    },
  }),

  defineTool({
    name: "crear_movimiento_manual",
    title: "Crear movimiento manual",
    description:
      "Apunta un movimiento a mano en una cuenta (efectivo o cuentas sin banco conectado). `importe` negativo para gastos y positivo para ingresos, en la moneda de la cuenta.",
    risk: "write",
    input: z.object({
      cuenta_id: z.string(),
      fecha: isoDay,
      concepto: z.string().min(1).max(200),
      importe: z.number().refine((n) => n !== 0, "importe distinto de 0"),
      categoria_id: z.string().nullable().optional(),
      nota: z.string().max(500).optional(),
    }),
    run: async (i, ctx) =>
      createManualTransaction(ctx, {
        accountId: i.cuenta_id,
        date: i.fecha,
        description: i.concepto,
        amountCents: toCents(i.importe),
        categoryId: i.categoria_id,
        note: i.nota,
      }),
  }),

  defineTool({
    name: "listar_cuentas",
    title: "Listar cuentas",
    description:
      "Cuentas con su saldo actual en su moneda y en EUR, el dinero total en EUR separado en personal y trabajo (empresa/LLC) según el ámbito de cada cuenta, de dónde vienen (Wise, Mercury o manual) y cuántas horas tiene el saldo: un saldo de hace días puede no ser dinero disponible real. Las huchas de Wise aparecen con tipo savings.",
    risk: "read",
    input: z.object({}),
    run: async (_i, ctx) => {
      const r = await listAccounts(ctx);
      const now = Date.now();
      return {
        dinero_total_eur: money(r.totalCents),
        // Personal vs company (LLC) money, by each account's scope
        por_ambito_eur: {
          personal: money(r.byScope.personal),
          trabajo: money(r.byScope.work),
        },
        cuentas: r.items.map((a) => ({
          id: a.id,
          nombre: a.name,
          origen: a.provider ?? "manual",
          tipo: a.kind,
          ambito: a.scope,
          saldo: money(a.balanceCents),
          moneda: a.currency,
          saldo_eur: money(a.baseBalanceCents),
          actualizado: a.balanceUpdatedAt?.toISOString() ?? null,
          horas_desde_actualizacion: a.balanceUpdatedAt
            ? Math.round((now - a.balanceUpdatedAt.getTime()) / 36e5)
            : null,
          ultimo_sync_banco: a.lastSyncedAt?.toISOString() ?? null,
          error_sync: a.lastError,
        })),
      };
    },
  }),

  defineTool({
    name: "listar_categorias",
    title: "Listar categorías",
    description:
      "Categorías disponibles con su id, tipo (expense, income o transfer: las transferencias no cuentan como gasto ni ingreso) y ámbito (personal o work).",
    risk: "read",
    input: z.object({}),
    run: async (_i, ctx) =>
      (await listCategories(ctx)).map((c) => ({
        id: c.id,
        nombre: c.name,
        tipo: c.kind,
        ambito: c.scope,
        dinero_prestado: c.isLending,
      })),
  }),

  defineTool({
    name: "listar_suscripciones",
    title: "Listar suscripciones",
    description:
      "Suscripciones con importe, ciclo, próximo cobro, ámbito (personal o trabajo) y su coste mensual en EUR, más el total mensual y anual de las activas separado en personal y trabajo.",
    risk: "read",
    input: z.object({ solo_activas: z.boolean().default(true) }),
    run: async ({ solo_activas }, ctx) => {
      const r = await listSubscriptions(ctx);
      return {
        resumen_eur: {
          al_mes: money(r.summary.monthlyCents),
          al_año: money(r.summary.yearlyCents),
          personal_al_mes: money(r.summary.personalMonthlyCents),
          trabajo_al_mes: money(r.summary.workMonthlyCents),
          activas: r.summary.activeCount,
        },
        suscripciones: r.items
          .filter((s) => !solo_activas || s.isActive)
          .map((s) => ({
            id: s.id,
            nombre: s.name,
            importe: money(s.amountCents),
            moneda: s.currency,
            ciclo: s.cycle,
            al_mes_eur: money(s.monthlyBaseCents),
            ambito: s.scope,
            categoria_id: s.categoryId,
            proximo_cobro: s.nextChargeOn,
            activa: s.isActive,
            web: s.url,
            notas: s.notes,
          })),
      };
    },
  }),

  defineTool({
    name: "guardar_suscripcion",
    title: "Crear o actualizar suscripción",
    description:
      "Crea una suscripción, o la actualiza si pasas `id` (solo cambian los campos que envíes). `importe` tal cual se cobra, en su moneda y ciclo. `ambito`: work para lo que necesitas para trabajar (servidores, IA…), personal para el resto.",
    risk: "write",
    input: z.object({
      id: z.string().optional(),
      nombre: z.string().min(1).max(120).optional(),
      importe: z.number().positive().optional(),
      moneda: z.string().length(3).toUpperCase().optional(),
      ciclo: z.enum(BILLING_CYCLES).optional(),
      ambito: z.enum(SCOPES).optional(),
      categoria_id: z.string().nullable().optional(),
      proximo_cobro: isoDay.nullable().optional(),
      activa: z.boolean().optional(),
      web: z.string().url().nullable().optional(),
      notas: z.string().max(1000).nullable().optional(),
    }),
    run: async (i, ctx) => {
      const fields = {
        name: i.nombre,
        amountCents: i.importe === undefined ? undefined : toCents(i.importe),
        currency: i.moneda,
        cycle: i.ciclo,
        scope: i.ambito,
        categoryId: i.categoria_id,
        nextChargeOn: i.proximo_cobro,
        isActive: i.activa,
        url: i.web,
        notes: i.notas,
      };
      if (i.id) {
        await updateSubscription(
          ctx,
          i.id,
          Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
          ),
        );
        return { id: i.id, actualizada: true };
      }
      if (!fields.name || fields.amountCents === undefined) {
        throw new Error(
          "Para crear una suscripción hacen falta nombre e importe",
        );
      }
      const created = await createSubscription(ctx, {
        ...fields,
        name: fields.name,
        amountCents: fields.amountCents,
        currency: fields.currency ?? "EUR",
        cycle: fields.cycle ?? "monthly",
        scope: fields.scope ?? "personal",
      });
      return { id: created.id, creada: true };
    },
  }),

  defineTool({
    name: "sincronizar_bancos",
    title: "Sincronizar bancos",
    description:
      "Trae saldos y movimientos nuevos de Wise/Mercury ahora (normalmente se hace solo cada día). Sin `conexion_id` sincroniza todas las conexiones activas.",
    risk: "write",
    input: z.object({ conexion_id: z.string().optional() }),
    run: async ({ conexion_id }, ctx) => {
      const connections = (await listConnections(ctx)).filter(
        (c) => c.isActive && (!conexion_id || c.id === conexion_id),
      );
      const results = [];
      for (const c of connections) {
        try {
          const r = await syncConnectionById(ctx, c.id, ctx.secret());
          results.push({
            conexion: c.name,
            cuentas: r.accounts,
            movimientos_revisados: r.syncedCount,
            avisos: r.errors,
          });
        } catch (error) {
          results.push({
            conexion: c.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return results;
    },
  }),
];

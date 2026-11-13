"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Repeat,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type RouterOutputs } from "@/trpc/react";
import { money, monthKey, monthLabel, shortDate } from "../format";
import { PageHeader, StatCard } from "../page-header";

type Overview = RouterOutputs["finance"]["overview"];
type Range = 3 | 6 | 12;

const lastMonths = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return monthKey(d);
  });

/** Months that had any movement: before the first one there is nothing to average */
const withData = (months: Overview["monthly"]) =>
  months.filter((m) => m.incomeCents > 0 || m.expenseCents > 0);

const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/** Least-squares slope: how much spending grows (or shrinks) per month */
function slope(values: number[]) {
  const n = values.length;
  if (n < 3) return null;
  const mx = (n - 1) / 2;
  const my = average(values);
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    num += (i - mx) * (v - my);
    den += (i - mx) ** 2;
  });
  return den ? num / den : null;
}

const pct = (value: number, base: number) =>
  base > 0 ? Math.round(((value - base) / base) * 100) : null;

/** Axis labels: "850 €", "1,7k €" */
const compactMoney = (cents: number) => {
  const euros = cents / 100;
  return Math.abs(euros) >= 1000
    ? `${(euros / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k €`
    : `${Math.round(euros)} €`;
};

export function OverviewView() {
  const [month, setMonth] = useState(monthKey());
  const [range, setRange] = useState<Range>(6);
  const overview = api.finance.overview.useQuery(
    { month, range },
    { placeholderData: (previous) => previous },
  );
  const data = overview.data;

  return (
    <>
      <PageHeader
        title="Resumen"
        actions={
          <NativeSelect
            aria-label="Mes"
            value={month}
            onChange={(e) => setMonth(e.currentTarget.value)}
            className="w-44"
          >
            {lastMonths(12).map((m) => (
              <NativeSelectOption key={m} value={m}>
                {monthLabel(m)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        }
      />

      <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {!data ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              inverted
              label="Dinero total"
              value={money(data.totalBalanceCents)}
              note={`En ${data.accountsCount} ${data.accountsCount === 1 ? "cuenta" : "cuentas"}, en euros`}
              icon={<Wallet className="size-4" />}
            />
            <StatCard
              label="Ingresos del mes"
              value={money(data.incomeCents)}
              note={monthLabel(month)}
              icon={<ArrowDownLeft className="size-4" />}
            />
            <StatCard
              label="Gastos del mes"
              value={money(data.expenseCents)}
              note={`${money(data.incomeCents - data.expenseCents, "EUR", { sign: true })} de margen`}
              icon={<ArrowUpRight className="size-4" />}
            />
            <StatCard
              label="Suscripciones"
              value={`${money(data.subscriptions.monthlyCents)}/mes`}
              note={`${money(data.subscriptions.personalMonthlyCents)} personal · ${money(data.subscriptions.workMonthlyCents)} trabajo`}
              icon={<Repeat className="size-4" />}
            />
          </>
        )}
      </div>

      {data && data.uncategorizedCount > 0 && (
        <Link
          href="/dashboard/movimientos?categoria=__none"
          className="bg-muted/60 hover:bg-muted mt-3 flex items-center justify-between rounded-xl px-5 py-4 text-sm transition-colors"
        >
          <span>{data.uncategorizedCount} movimientos sin categoría</span>
          <ArrowRight className="size-4" />
        </Link>
      )}

      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Análisis</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {range} meses hasta {monthLabel(month)}
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(range)}
          onValueChange={(v) => v && setRange(Number(v) as Range)}
          aria-label="Periodo del análisis"
        >
          <ToggleGroupItem value="3">3 meses</ToggleGroupItem>
          <ToggleGroupItem value="6">6 meses</ToggleGroupItem>
          <ToggleGroupItem value="12">12 meses</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {data ? (
          <SpendingTrend data={data} />
        ) : (
          <Skeleton className="h-96 rounded-xl xl:col-span-2" />
        )}
        {data ? (
          <IncomeVsSpending data={data} />
        ) : (
          <Skeleton className="h-80 rounded-xl xl:row-span-2" />
        )}
        {data ? (
          <CategoryBreakdown data={data} />
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
        <LendingSection lending={data?.lending} />
      </div>
    </>
  );
}

/**
 * Full-width spending chart for the period: month totals (with where this month is heading)
 * against the period average, or the same months split by category.
 */
function SpendingTrend({ data }: { data: Overview }) {
  const [view, setView] = useState<"total" | "categories">("total");
  const { monthly, pace } = data;
  const current = monthly.at(-1)!;
  const previous = withData(monthly.slice(0, -1));
  const isCurrent = pace.isCurrent;
  // A month still running is compared by where it will likely end, not by what it has spent yet
  const closing = isCurrent ? data.projectedExpenseCents : current.expenseCents;
  const lastMonth = monthly.at(-2);
  const avg = average(previous.map((m) => m.expenseCents));
  const trend = slope(previous.map((m) => m.expenseCents));
  const vsLast = lastMonth ? pct(closing, lastMonth.expenseCents) : null;
  const vsAvg = previous.length ? pct(closing, avg) : null;

  return (
    <section className="bg-muted min-w-0 rounded-xl p-6 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Evolución del gasto</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Gasto de cada mes, sin transferencias entre tus cuentas
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(v) => v && setView(v as typeof view)}
          aria-label="Vista del gráfico"
        >
          <ToggleGroupItem value="total">Total</ToggleGroupItem>
          <ToggleGroupItem value="categories">Por categoría</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        <TrendStat
          label={isCurrent ? "Cierre previsto" : "Gasto del mes"}
          value={money(closing)}
          note={
            isCurrent
              ? `${money(current.expenseCents)} gastados a día ${pace.today}`
              : monthLabel(current.month)
          }
        />
        <TrendStat
          label="Frente al mes anterior"
          value={vsLast === null ? "—" : `${vsLast > 0 ? "+" : ""}${vsLast} %`}
          note={
            lastMonth
              ? `${money(closing - lastMonth.expenseCents, "EUR", { sign: true })} vs ${monthLabel(lastMonth.month, "short")}`
              : "Sin mes anterior"
          }
        />
        <TrendStat
          label={`Frente a la media`}
          value={vsAvg === null ? "—" : `${vsAvg > 0 ? "+" : ""}${vsAvg} %`}
          note={
            previous.length
              ? `Media de ${previous.length} ${previous.length === 1 ? "mes" : "meses"}: ${money(Math.round(avg))}`
              : "Aún no hay meses para comparar"
          }
        />
        <TrendStat
          label="Tendencia"
          value={
            trend === null
              ? "—"
              : `${money(Math.round(trend), "EUR", { sign: true })}/mes`
          }
          note={
            trend === null
              ? "Hacen falta 3 meses cerrados"
              : Math.abs(trend) < avg * 0.02
                ? "El gasto se mantiene estable"
                : trend > 0
                  ? "El gasto va subiendo mes a mes"
                  : "El gasto va bajando mes a mes"
          }
        />
      </dl>

      {view === "total" ? (
        <TotalChart
          data={data}
          average={previous.length ? Math.round(avg) : null}
        />
      ) : (
        <CategoryChart data={data} />
      )}
    </section>
  );
}

function TrendStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-xl font-medium tabular-nums">{value}</dd>
      <dd className="text-muted-foreground mt-0.5 truncate text-xs">{note}</dd>
    </div>
  );
}

const totalConfig = {
  spent: { label: "Gastado", color: "var(--foreground)" },
  projected: { label: "Previsto hasta fin de mes", color: "var(--foreground)" },
} satisfies ChartConfig;

function TotalChart({
  data,
  average: avg,
}: {
  data: Overview;
  average: number | null;
}) {
  const last = data.monthly.length - 1;
  const rows = data.monthly.map((m, i) => ({
    month: m.month,
    label: monthLabel(m.month, "short"),
    spent: m.expenseCents,
    projected:
      i === last && data.pace.isCurrent
        ? Math.max(0, data.projectedExpenseCents - m.expenseCents)
        : 0,
  }));
  return (
    <>
      <ChartContainer
        config={totalConfig}
        className="mt-8 aspect-auto h-64 w-full"
      >
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.4} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => compactMoney(v)}
          />
          <ChartTooltip
            cursor={{ fillOpacity: 0.4 }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as
                (typeof rows)[number] | undefined;
              if (!active || !row) return null;
              return (
                <TooltipBox title={monthLabel(row.month)}>
                  <TooltipLine label="Gastado" value={row.spent} />
                  {row.projected > 0 && (
                    <TooltipLine
                      label="Cierre previsto"
                      value={row.spent + row.projected}
                    />
                  )}
                  {avg !== null && (
                    <TooltipLine
                      label="Frente a la media"
                      value={row.spent + row.projected - avg}
                      sign
                    />
                  )}
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="spent" stackId="m" maxBarSize={44}>
            {rows.map((r, i) => (
              <Cell
                key={r.month}
                fill="var(--color-spent)"
                fillOpacity={i === last ? 1 : 0.55}
                radius={r.projected > 0 ? 0 : ([6, 6, 0, 0] as never)}
              />
            ))}
          </Bar>
          <Bar
            dataKey="projected"
            stackId="m"
            maxBarSize={44}
            fill="var(--color-projected)"
            fillOpacity={0.15}
            stroke="var(--color-projected)"
            strokeOpacity={0.4}
            strokeDasharray="3 3"
            radius={[6, 6, 0, 0]}
          />
          {avg !== null && (
            <ReferenceLine
              y={avg}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
          )}
        </BarChart>
      </ChartContainer>
      <div className="text-muted-foreground mt-4 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground size-2 rounded-full" /> Gastado
        </span>
        {data.pace.isCurrent && (
          <span className="flex items-center gap-1.5">
            <span className="border-foreground/40 bg-foreground/15 size-2 rounded-full border border-dashed" />
            Previsto hasta fin de mes (según un mes típico)
          </span>
        )}
        {avg !== null && (
          <span className="flex items-center gap-1.5">
            <span className="border-muted-foreground w-3 border-t border-dashed" />
            Media de los meses anteriores
          </span>
        )}
      </div>
    </>
  );
}

const TOP_CATEGORIES = 6;

function CategoryChart({ data }: { data: Overview }) {
  const top = data.periodCategories.slice(0, TOP_CATEGORIES);
  const hasOthers = data.periodCategories.length > TOP_CATEGORIES;
  // Recharts keys must be CSS-safe, category ids may not be
  const series = [
    ...top.map((c, i) => ({
      key: `c${i}`,
      id: c.key,
      name: c.name,
      color: c.color,
    })),
    ...(hasOthers
      ? [
          {
            key: "others",
            id: null,
            name: "Otras",
            color: "var(--muted-foreground)",
          },
        ]
      : []),
  ];
  const topIds = new Set(top.map((c) => c.key));
  const rows = data.monthly.map((m) => {
    const row: Record<string, number | string> = {
      month: m.month,
      label: monthLabel(m.month, "short"),
    };
    for (const s of series) {
      row[s.key] = s.id
        ? (m.byCategory[s.id] ?? 0)
        : Object.entries(m.byCategory)
            .filter(([k]) => !topIds.has(k))
            .reduce((n, [, v]) => n + v, 0);
    }
    return row;
  });
  const config = Object.fromEntries(
    series.map((s) => [s.key, { label: s.name, color: s.color }]),
  ) satisfies ChartConfig;

  if (!series.length)
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        Aún no hay gastos en este periodo.
      </p>
    );

  return (
    <>
      <ChartContainer config={config} className="mt-8 aspect-auto h-64 w-full">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.4} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => compactMoney(v)}
          />
          <ChartTooltip
            cursor={{ fillOpacity: 0.4 }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as
                (typeof rows)[number] | undefined;
              if (!active || !row) return null;
              const total = series.reduce((n, s) => n + Number(row[s.key]), 0);
              return (
                <TooltipBox title={monthLabel(String(row.month))}>
                  {series
                    .filter((s) => Number(row[s.key]) > 0)
                    .map((s) => (
                      <TooltipLine
                        key={s.key}
                        label={s.name}
                        value={Number(row[s.key])}
                        color={s.color}
                      />
                    ))}
                  <TooltipLine label="Total" value={total} strong />
                </TooltipBox>
              );
            }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="m"
              fill={`var(--color-${s.key})`}
              maxBarSize={44}
              radius={i === series.length - 1 ? [6, 6, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </>
  );
}

function TooltipBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background border-border/60 min-w-44 rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function TooltipLine({
  label,
  value,
  color,
  sign,
  strong,
}: {
  label: string;
  value: number;
  color?: string;
  sign?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${strong ? "border-border/60 mt-1 border-t pt-1 font-medium" : ""}`}
    >
      <span className="text-muted-foreground flex items-center gap-1.5">
        {color && (
          <span className="size-2 rounded-full" style={{ background: color }} />
        )}
        {label}
      </span>
      <span className="tabular-nums">{money(value, "EUR", { sign })}</span>
    </div>
  );
}

/** Income and spending per month of the period, with how much of the income was kept */
function IncomeVsSpending({ data }: { data: Overview }) {
  const { monthly, month } = data;
  const maxBar = Math.max(
    1,
    ...monthly.flatMap((m) => [m.incomeCents, m.expenseCents]),
  );
  const months = withData(monthly);
  const income = months.reduce((n, m) => n + m.incomeCents, 0);
  const expense = months.reduce((n, m) => n + m.expenseCents, 0);
  const saved = income - expense;
  const rate = income > 0 ? Math.round((saved / income) * 100) : null;

  return (
    <section className="bg-muted flex min-w-0 flex-col rounded-xl p-6 xl:row-span-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Entradas y salidas</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Lo que entra frente a lo que sale cada mes
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-medium tabular-nums">
            {months.length
              ? money(Math.round(saved / months.length), "EUR", { sign: true })
              : "—"}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {rate === null
              ? "Ahorro medio al mes"
              : `Ahorro medio al mes · ${rate} % de lo que entra`}
          </p>
        </div>
      </div>
      <div className="mt-6 flex min-h-44 flex-1 items-end justify-between gap-2">
        {monthly.map((m) => (
          <div
            key={m.month}
            className="flex h-full min-w-0 flex-1 flex-col justify-end gap-3 text-center"
          >
            <div
              className="flex h-full items-end justify-center gap-1"
              title={`${monthLabel(m.month)}: +${money(m.incomeCents)} / −${money(m.expenseCents)}`}
            >
              <div
                className="bg-foreground/20 w-full max-w-5 rounded-t-md"
                style={{
                  height: `${Math.max(2, (m.incomeCents / maxBar) * 100)}%`,
                }}
              />
              <div
                className={`w-full max-w-5 rounded-t-md ${m.month === month ? "bg-foreground" : "bg-foreground/60"}`}
                style={{
                  height: `${Math.max(2, (m.expenseCents / maxBar) * 100)}%`,
                }}
              />
            </div>
            <span className="text-muted-foreground truncate text-xs">
              {monthLabel(m.month, "short")}
            </span>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mt-4 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground/20 size-2 rounded-full" /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground size-2 rounded-full" /> Salidas
        </span>
      </div>
    </section>
  );
}

/** The month's spending by category, next to what each one usually costs in the period */
function CategoryBreakdown({ data }: { data: Overview }) {
  const previous = withData(data.monthly.slice(0, -1));
  const usual = (key: string) =>
    previous.length
      ? Math.round(average(previous.map((m) => m.byCategory[key] ?? 0)))
      : null;
  const shown = data.spendingByCategory.slice(0, 7);
  // The scale fits both this month and the usual amount, so the average mark never falls off
  const maxCategory = Math.max(
    1,
    ...shown.flatMap((c) => [c.cents, usual(c.id ?? "none") ?? 0]),
  );

  return (
    <section className="bg-muted rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-medium">En qué se va</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {monthLabel(data.month)}
            {previous.length > 0 &&
              ` · media de ${previous.length} ${previous.length === 1 ? "mes" : "meses"} en gris`}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/movimientos">
            Ver todo <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
      <ul className="mt-5 space-y-3.5">
        {data.spendingByCategory.length === 0 && (
          <li className="text-muted-foreground py-8 text-center text-sm">
            Aún no hay gastos este mes.
          </li>
        )}
        {shown.map((c) => {
          const avg = usual(c.id ?? "none");
          return (
            <li key={c.id ?? "none"}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  {avg !== null && (
                    <span className="text-muted-foreground text-xs">
                      {money(avg)}
                    </span>
                  )}
                  {money(c.cents)}
                </span>
              </div>
              <div className="bg-foreground/10 relative mt-1.5 h-1 rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(c.cents / maxCategory) * 100}%`,
                    background: c.color,
                  }}
                />
                {avg !== null && avg > 0 && (
                  <span
                    className="bg-foreground/50 absolute -top-0.5 h-2 w-0.5 rounded-full"
                    style={{
                      left: `calc(${(avg / maxCategory) * 100}% - 1px)`,
                    }}
                    title={`Media: ${money(avg)}`}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Money lent in categories marked as lending, per person, until it comes back */
function LendingSection({ lending }: { lending?: Overview["lending"] }) {
  if (!lending) return <Skeleton className="h-64 rounded-xl" />;
  return (
    <section className="bg-muted rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Te deben</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Dinero prestado que tiene que volver
          </p>
        </div>
        {lending.totalCents > 0 && (
          <p className="text-2xl font-medium tabular-nums">
            {money(lending.totalCents)}
          </p>
        )}
      </div>
      {!lending.hasMovements ? (
        <p className="text-muted-foreground mt-6 text-sm">
          Marca una categoría como dinero prestado en{" "}
          <Link
            href="/dashboard/ajustes/categorias"
            className="text-foreground underline underline-offset-4"
          >
            Ajustes → Categorías
          </Link>{" "}
          y aquí verás quién te debe cuánto.
        </p>
      ) : lending.people.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nadie te debe nada ahora mismo.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {lending.people.slice(0, 6).map((p) => (
            <li
              key={p.name}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate">{p.name}</span>
                {p.lastLentAt && (
                  <span className="text-muted-foreground text-xs">
                    Último préstamo el {shortDate(p.lastLentAt)}
                  </span>
                )}
              </span>
              <span className="tabular-nums">{money(p.owedCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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

import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type RouterOutputs } from "@/trpc/react";
import { money, monthKey, monthLabel, shortDate } from "../format";
import { PageHeader, StatCard } from "../page-header";

type Overview = RouterOutputs["finance"]["overview"];

const lastMonths = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return monthKey(d);
  });

export function OverviewView() {
  const [month, setMonth] = useState(monthKey());
  const overview = api.finance.overview.useQuery({ month });
  const data = overview.data;
  const maxBar = Math.max(
    1,
    ...(data?.monthly.flatMap((m) => [m.incomeCents, m.expenseCents]) ?? []),
  );
  const maxCategory = Math.max(
    1,
    ...(data?.spendingByCategory.map((c) => c.cents) ?? []),
  );

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

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="bg-muted rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-medium">Entradas y salidas</h2>
            </div>
            <span className="text-muted-foreground text-xs">
              Últimos 6 meses
            </span>
          </div>
          <div className="mt-6 flex h-44 items-end justify-between gap-3">
            {(data?.monthly ?? []).map((m) => (
              <div
                key={m.month}
                className="flex h-full flex-1 flex-col justify-end gap-3 text-center"
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
                <span className="text-muted-foreground text-xs">
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

        <section className="bg-muted rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-medium">En qué se va</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {monthLabel(month)}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/movimientos">
                Ver todo <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
          <ul className="mt-5 space-y-3.5">
            {data?.spendingByCategory.length === 0 && (
              <li className="text-muted-foreground py-8 text-center text-sm">
                Aún no hay gastos este mes.
              </li>
            )}
            {data?.spendingByCategory.slice(0, 7).map((c) => (
              <li key={c.id ?? "none"}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: c.color }}
                    />
                    {c.name}
                  </span>
                  <span className="tabular-nums">{money(c.cents)}</span>
                </div>
                <div className="bg-foreground/10 mt-1.5 h-1 rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(c.cents / maxCategory) * 100}%`,
                      background: c.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <PaceSection pace={data?.pace} />
        <LendingSection lending={data?.lending} />
      </div>
    </>
  );
}

/** This month's spending, day by day, against the median of the previous months */
function PaceSection({ pace }: { pace?: Overview["pace"] }) {
  if (!pace) return <Skeleton className="h-64 rounded-xl" />;
  const { currentCents, typicalCents, today, daysInMonth } = pace;
  const spent = currentCents.at(-1) ?? 0;
  const typicalToday = typicalCents[today - 1] ?? 0;
  const diff = spent - typicalToday;
  const max = Math.max(1, ...currentCents, ...typicalCents);
  const W = 300;
  const H = 120;
  const x = (i: number) => (daysInMonth > 1 ? (i / (daysInMonth - 1)) * W : 0);
  const y = (c: number) => H - (c / max) * H;
  const line = (values: number[]) =>
    values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const compared = pace.monthsCompared > 0;
  const ahead = diff > 0;

  return (
    <section className="bg-muted rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Ritmo del mes</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {pace.isCurrent
              ? `Día ${today} de ${daysInMonth}`
              : monthLabel(pace.month)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-medium tabular-nums">{money(spent)}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {!compared
              ? "Aún no hay meses para comparar"
              : Math.abs(diff) < 100
                ? `Como un mes típico${pace.isCurrent ? " a estas alturas" : ""}`
                : `${money(Math.abs(diff))} ${ahead ? "más" : "menos"} que un mes típico${pace.isCurrent ? " a día de hoy" : ""}`}
          </p>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-6 h-36 w-full overflow-visible"
        role="img"
        aria-label={`Gastado ${money(spent)}; un mes típico lleva ${money(typicalToday)} el día ${today}`}
      >
        {compared && (
          <path
            d={line(typicalCents)}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={line(currentCents)}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="text-muted-foreground mt-4 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground h-0.5 w-3 rounded-full" />
          {pace.isCurrent ? "Este mes" : monthLabel(pace.month, "short")}
        </span>
        {compared && (
          <span className="flex items-center gap-1.5">
            <span className="border-muted-foreground w-3 border-t border-dashed" />
            Mes típico (mediana de {pace.monthsCompared}{" "}
            {pace.monthsCompared === 1 ? "mes" : "meses"})
          </span>
        )}
        {compared && (
          <span className="ml-auto tabular-nums">
            Mes típico entero: {money(typicalCents.at(-1) ?? 0)}
          </span>
        )}
      </div>
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

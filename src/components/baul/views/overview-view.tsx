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
import { api } from "@/trpc/react";
import { money, monthKey, monthLabel } from "../format";
import { PageHeader, StatCard } from "../page-header";

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
    </>
  );
}

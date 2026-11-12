"use client";

import { ConfirmDialog } from "@/components/baul/confirm-dialog";
import { useState, type ReactNode } from "react";
import { CalendarClock, Plus, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type RouterOutputs } from "@/trpc/react";
import {
  DEBT_KIND_LABEL,
  FLOW_CYCLE_LABEL,
  SCOPE_LABEL,
  centsToInput,
  formText,
  monthKey,
  monthLabel,
  money,
  parseCents,
  shortDate,
} from "../format";
import { PageHeader, StatCard } from "../page-header";

type Planning = RouterOutputs["finance"]["planning"];
type Debt = Planning["debts"]["list"][number];
type Goal = Planning["goals"]["list"][number];
type Budget = Planning["budgets"]["list"][number];
type Flow = Planning["flows"]["list"][number];
type Scope = "personal" | "work";

const CURRENCIES = ["EUR", "USD", "GBP"];

/** "5,25" → 525 basis points */
const parseBps = (value: string) => {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const pct = (n: number) =>
  `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
/** "1 dic", or "1 dic 2027" when it is not this year */
const day = (iso: string) =>
  iso.startsWith(String(new Date().getFullYear()))
    ? shortDate(iso)
    : new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(iso));
const bpsToInput = (bps: number | null | undefined) =>
  bps === null || bps === undefined ? "" : String(bps / 100).replace(".", ",");

/** Shared mutation callbacks: toast, close, refresh everything financial */
function useDone(onClose: () => void) {
  const utils = api.useUtils();
  return {
    onSuccess: async () => {
      toast.success("Guardado");
      onClose();
      await utils.finance.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
}

const planningPages = {
  prevision: { title: "Previsión", component: ForecastSection },
  deudas: { title: "Deudas", component: DebtsSection },
  objetivos: { title: "Objetivos", component: GoalsSection },
  presupuestos: { title: "Presupuestos", component: BudgetsSection },
  flujos: { title: "Flujos previstos", component: FlowsSection },
};

export function PlanningView({ page }: { page: keyof typeof planningPages }) {
  const { title, component: Content } = planningPages[page];
  const [scope, setScope] = useState<Scope | "all">("all");
  return (
    <>
      <PageHeader
        title={title}
        actions={
          <ToggleGroup
            type="single"
            variant="outline"
            value={scope}
            onValueChange={(v) => v && setScope(v as Scope | "all")}
          >
            <ToggleGroupItem value="all">Todo</ToggleGroupItem>
            <ToggleGroupItem value="personal">Personal</ToggleGroupItem>
            <ToggleGroupItem value="work">Trabajo</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      <Content scope={scope === "all" ? undefined : scope} />
    </>
  );
}

// ── Layout pieces ────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ListBox<T>({
  items,
  empty,
  error,
  children,
}: {
  items: T[] | undefined;
  empty: string;
  error?: string;
  children: (item: T) => ReactNode;
}) {
  return (
    <div className="bg-muted overflow-hidden rounded-xl">
      {error ? (
        <p role="alert" className="text-destructive px-4 py-6 text-sm">
          No se pudieron cargar los datos: {error}
        </p>
      ) : !items ? (
        <div className="space-y-px p-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="bg-background/70 h-14 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground px-4 py-10 text-center text-sm">
          {empty}
        </p>
      ) : (
        <ul className="divide-background divide-y">{items.map(children)}</ul>
      )}
    </div>
  );
}

function Row({
  onClick,
  muted,
  title,
  subtitle,
  amount,
  amountNote,
  children,
}: {
  onClick: () => void;
  muted?: boolean;
  title: string;
  subtitle?: string;
  amount?: string;
  amountNote?: string;
  children?: ReactNode;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`hover:bg-foreground/[0.03] block w-full px-4 py-3 text-left sm:px-5 ${muted ? "opacity-50" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{title}</p>
            {subtitle && (
              <p className="text-muted-foreground truncate text-xs">
                {subtitle}
              </p>
            )}
          </div>
          {amount && (
            <div className="shrink-0 text-right">
              <p className="text-sm tabular-nums">{amount}</p>
              {amountNote && (
                <p className="text-muted-foreground text-xs">{amountNote}</p>
              )}
            </div>
          )}
        </div>
        {children}
      </button>
    </li>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function FormDialog({
  open,
  title,
  formKey,
  onClose,
  onSubmit,
  onDelete,
  pending,
  children,
}: {
  open: boolean;
  title: string;
  formKey: string;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
  onDelete?: () => void;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <form
          key={formKey}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) onSubmit(new FormData(e.currentTarget));
          }}
        >
          {children}
          <DialogFooter className="gap-2">
            {onDelete && (
              <ConfirmDialog
                title="¿Seguro que quieres eliminarlo?"
                description="Esta acción no se puede deshacer."
                onConfirm={onDelete}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:mr-auto"
                  disabled={pending}
                >
                  Eliminar
                </Button>
              </ConfirmDialog>
            )}
            <Button type="submit" disabled={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScopeSelect({ id, value }: { id: string; value?: Scope }) {
  return (
    <NativeSelect
      id={id}
      name="scope"
      defaultValue={value ?? "personal"}
      className="w-full"
    >
      <NativeSelectOption value="personal">Personal</NativeSelectOption>
      <NativeSelectOption value="work">Trabajo</NativeSelectOption>
    </NativeSelect>
  );
}

function CurrencySelect({ id, value }: { id: string; value?: string }) {
  return (
    <NativeSelect
      id={id}
      name="currency"
      defaultValue={value ?? "EUR"}
      className="w-full"
    >
      {CURRENCIES.map((c) => (
        <NativeSelectOption key={c} value={c}>
          {c}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Amount field → cents, or a toast and null */
function readCents(
  f: FormData,
  name: string,
  { allowZero = false, optional = false } = {},
) {
  const raw = formText(f, name).trim();
  if (!raw && optional) return null;
  const cents = parseCents(raw);
  if (!Number.isFinite(cents) || (!allowZero && cents === 0)) {
    toast.error("Importe no válido");
    return undefined;
  }
  return cents;
}

// ── Forecast ─────────────────────────────────────────────────────────────────

function ForecastSection({ scope }: { scope?: Scope }) {
  const forecast = api.finance.planning.forecast.useQuery({ scope });
  const f = forecast.data;
  return (
    <Section
      title="Previsión"
      description="Saldo esperado contando lo fechado (flujos previstos, suscripciones y cuotas) y tu gasto variable medio. No da por hecho ningún ingreso que no hayas apuntado."
    >
      {forecast.error && (
        <p role="alert" className="text-destructive mb-3 text-sm">
          No se pudo cargar la previsión: {forecast.error.message}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {forecast.error ? null : !f ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              inverted
              label="Hoy"
              value={money(f.currentBalanceCents)}
              icon={<Wallet className="size-4" />}
              note={`Gasto variable típico ${money(f.baseline.avgVariableSpendingCents)}/mes`}
            />
            {f.forecasts.map((p) => (
              <StatCard
                key={p.days}
                label={`En ${p.days} días`}
                value={money(p.projectedBalanceCents)}
                icon={<CalendarClock className="size-4" />}
                note={`+${money(p.expectedIncomeCents)} · −${money(p.expectedExpensesCents)}`}
              />
            ))}
          </>
        )}
      </div>
      {f && f.staleAccounts.length > 0 && (
        <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
          <TriangleAlert className="size-3.5 shrink-0" />
          Saldo de hace más de un día en: {f.staleAccounts.join(", ")}
        </p>
      )}
      {f && f.upcoming.length > 0 && (
        <div className="mt-6">
          <p className="text-muted-foreground mb-2 text-sm">
            Próximos cobros y pagos
          </p>
          <ListBox items={f.upcoming.slice(0, 12)} empty="">
            {(e) => (
              <li
                key={`${e.date}-${e.source}-${e.name}`}
                className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
              >
                <span className="text-muted-foreground w-14 shrink-0 text-xs">
                  {shortDate(e.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {e.name}
                  <span className="text-muted-foreground"> · {e.source}</span>
                </span>
                <span
                  className={`shrink-0 text-sm tabular-nums ${e.amountCents > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                >
                  {money(e.amountCents, e.currency, { sign: true })}
                </span>
              </li>
            )}
          </ListBox>
        </div>
      )}
    </Section>
  );
}

// ── Planned flows ────────────────────────────────────────────────────────────

function FlowsSection({ scope }: { scope?: Scope }) {
  const flows = api.finance.planning.flows.list.useQuery();
  const [editing, setEditing] = useState<Flow | "new" | null>(null);
  return (
    <Section
      title="Flujos previstos"
      description="Lo que esperas cobrar o pagar y el banco aún no sabe: facturas, impuestos, una reparación…"
      action={
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Nuevo
        </Button>
      }
    >
      <ListBox
        items={flows.data?.filter((item) => !scope || item.scope === scope)}
        error={flows.error?.message}
        empty="Nada previsto todavía."
      >
        {(fl) => (
          <Row
            key={fl.id}
            onClick={() => setEditing(fl)}
            muted={!fl.isActive}
            title={fl.name}
            subtitle={`${FLOW_CYCLE_LABEL[fl.cycle]} · ${fl.cycle === "once" ? "" : "próximo "}${day(fl.nextOn)}${fl.endsOn ? ` · hasta ${day(fl.endsOn)}` : ""} · ${SCOPE_LABEL[fl.scope]}`}
            amount={money(fl.amountCents, fl.currency, { sign: true })}
          />
        )}
      </ListBox>
      <FlowDialog flow={editing} onClose={() => setEditing(null)} />
    </Section>
  );
}

function FlowDialog({
  flow,
  onClose,
}: {
  flow: Flow | "new" | null;
  onClose: () => void;
}) {
  const editing = flow && flow !== "new" ? flow : null;
  const done = useDone(onClose);
  const save = api.finance.planning.flows.save.useMutation(done);
  const remove = api.finance.planning.flows.delete.useMutation(done);
  return (
    <FormDialog
      open={flow !== null}
      title={editing ? editing.name : "Nuevo flujo previsto"}
      formKey={editing?.id ?? "new"}
      onClose={onClose}
      pending={save.isPending || remove.isPending}
      onDelete={editing ? () => remove.mutate({ id: editing.id }) : undefined}
      onSubmit={(f) => {
        const cents = readCents(f, "amount");
        if (cents === undefined || cents === null) return;
        const sign = formText(f, "direction") === "in" ? 1 : -1;
        save.mutate({
          id: editing?.id,
          name: formText(f, "name"),
          amountCents: Math.abs(cents) * sign,
          currency: formText(f, "currency"),
          cycle: formText(f, "cycle") as Flow["cycle"],
          nextOn: formText(f, "next"),
          endsOn: formText(f, "ends") || null,
          scope: formText(f, "scope") as Scope,
          notes: formText(f, "notes") || null,
          isActive: f.get("active") === "on",
        });
      }}
    >
      <Field label="Concepto" htmlFor="fl-name">
        <Input
          id="fl-name"
          name="name"
          required
          defaultValue={editing?.name}
          placeholder="Factura cliente, IVA, pintura del coche…"
        />
      </Field>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)_5.5rem] gap-3 *:min-w-0">
        <Field label="Tipo" htmlFor="fl-direction">
          <NativeSelect
            id="fl-direction"
            name="direction"
            defaultValue={editing && editing.amountCents > 0 ? "in" : "out"}
            className="w-full"
          >
            <NativeSelectOption value="out">Pago</NativeSelectOption>
            <NativeSelectOption value="in">Cobro</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field label="Importe" htmlFor="fl-amount">
          <Input
            id="fl-amount"
            name="amount"
            inputMode="decimal"
            required
            defaultValue={
              editing ? centsToInput(Math.abs(editing.amountCents)) : ""
            }
            placeholder="0,00"
          />
        </Field>
        <Field label="Moneda" htmlFor="fl-currency">
          <CurrencySelect id="fl-currency" value={editing?.currency} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <Field label="Frecuencia" htmlFor="fl-cycle">
          <NativeSelect
            id="fl-cycle"
            name="cycle"
            defaultValue={editing?.cycle ?? "once"}
            className="w-full"
          >
            {Object.entries(FLOW_CYCLE_LABEL).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Ámbito" htmlFor="fl-scope">
          <ScopeSelect id="fl-scope" value={editing?.scope} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <Field label="Fecha (próxima)" htmlFor="fl-next">
          <Input
            id="fl-next"
            name="next"
            type="date"
            required
            defaultValue={editing?.nextOn ?? ""}
          />
        </Field>
        <Field label="Termina" htmlFor="fl-ends">
          <Input
            id="fl-ends"
            name="ends"
            type="date"
            defaultValue={editing?.endsOn ?? ""}
          />
        </Field>
      </div>
      <Field label="Notas" htmlFor="fl-notes">
        <Textarea
          id="fl-notes"
          name="notes"
          rows={2}
          defaultValue={editing?.notes ?? ""}
        />
      </Field>
      <label className="flex items-center justify-between text-sm">
        Activo
        <Switch name="active" defaultChecked={editing?.isActive ?? true} />
      </label>
    </FormDialog>
  );
}

// ── Debts ────────────────────────────────────────────────────────────────────

function DebtsSection({ scope }: { scope?: Scope }) {
  const debts = api.finance.planning.debts.list.useQuery();
  const [editing, setEditing] = useState<Debt | "new" | null>(null);
  const active = (debts.data ?? []).filter(
    (d) => d.isActive && (!scope || d.scope === scope),
  );
  const total = active.reduce((n, d) => n + d.balanceBaseCents, 0);
  const monthly = active.reduce((n, d) => n + d.monthlyPaymentBaseCents, 0);
  return (
    <Section
      title="Deudas"
      description={
        active.length
          ? `${money(total)} pendientes · ${money(monthly)} al mes en cuotas`
          : "Préstamos, financiaciones y tarjetas de crédito."
      }
      action={
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Nueva
        </Button>
      }
    >
      <ListBox
        items={debts.data?.filter((item) => !scope || item.scope === scope)}
        error={debts.error?.message}
        empty="Sin deudas registradas."
      >
        {(d) => (
          <Row
            key={d.id}
            onClick={() => setEditing(d)}
            muted={!d.isActive}
            title={d.name}
            subtitle={[
              DEBT_KIND_LABEL[d.kind],
              d.lender,
              d.annualRatePct ? `TIN ${pct(d.annualRatePct)}` : "sin interés",
              d.monthsLeft !== null
                ? `${d.monthsLeft} meses (hasta ${d.payoffMonth ? monthLabel(d.payoffMonth, "long").toLowerCase() : "?"})`
                : d.monthlyPaymentCents
                  ? "la cuota no cubre los intereses"
                  : null,
              d.interestLeftCents
                ? `${money(d.interestLeftCents, d.currency)} de intereses`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            amount={money(d.balanceCents, d.currency)}
            amountNote={`${money(d.monthlyPaymentCents, d.currency)}/mes`}
          >
            {d.creditUsed !== null && (
              <Progress
                value={Math.min(100, d.creditUsed * 100)}
                className="mt-2 h-1"
              />
            )}
          </Row>
        )}
      </ListBox>
      <DebtDialog debt={editing} onClose={() => setEditing(null)} />
    </Section>
  );
}

function DebtDialog({
  debt,
  onClose,
}: {
  debt: Debt | "new" | null;
  onClose: () => void;
}) {
  const editing = debt && debt !== "new" ? debt : null;
  const done = useDone(onClose);
  const save = api.finance.planning.debts.save.useMutation(done);
  const remove = api.finance.planning.debts.delete.useMutation(done);
  return (
    <FormDialog
      open={debt !== null}
      title={editing ? editing.name : "Nueva deuda"}
      formKey={editing?.id ?? "new"}
      onClose={onClose}
      pending={save.isPending || remove.isPending}
      onDelete={editing ? () => remove.mutate({ id: editing.id }) : undefined}
      onSubmit={(f) => {
        const balance = readCents(f, "balance", { allowZero: true });
        const payment = readCents(f, "payment", { allowZero: true });
        const principal = readCents(f, "principal", { optional: true });
        const limit = readCents(f, "limit", { optional: true });
        if ([balance, payment, principal, limit].includes(undefined)) return;
        const rate = parseBps(formText(f, "rate") || "0");
        const apr = formText(f, "apr") ? parseBps(formText(f, "apr")) : null;
        if (!Number.isFinite(rate) || (apr !== null && !Number.isFinite(apr))) {
          toast.error("Interés no válido");
          return;
        }
        const day = Number(formText(f, "day"));
        save.mutate({
          id: editing?.id,
          kind: formText(f, "kind") as Debt["kind"],
          name: formText(f, "name"),
          lender: formText(f, "lender") || null,
          currency: formText(f, "currency"),
          balanceCents: balance!,
          monthlyPaymentCents: payment!,
          principalCents: principal ?? null,
          creditLimitCents: limit ?? null,
          annualRateBps: rate,
          aprBps: apr,
          paymentDay: day >= 1 && day <= 31 ? day : null,
          endsOn: formText(f, "ends") || null,
          merchant: formText(f, "merchant") || null,
          scope: formText(f, "scope") as Scope,
          notes: formText(f, "notes") || null,
          isActive: f.get("active") === "on",
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <Field label="Nombre" htmlFor="dbt-name">
          <Input
            id="dbt-name"
            name="name"
            required
            defaultValue={editing?.name}
            placeholder="Préstamo coche…"
          />
        </Field>
        <Field label="Tipo" htmlFor="dbt-kind">
          <NativeSelect
            id="dbt-kind"
            name="kind"
            defaultValue={editing?.kind ?? "loan"}
            className="w-full"
          >
            {Object.entries(DEBT_KIND_LABEL).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem] gap-3 *:min-w-0">
        <Field label="Pendiente" htmlFor="dbt-balance">
          <Input
            id="dbt-balance"
            name="balance"
            inputMode="decimal"
            required
            defaultValue={editing ? centsToInput(editing.balanceCents) : ""}
            placeholder="0,00"
          />
        </Field>
        <Field label="Cuota mensual" htmlFor="dbt-payment">
          <Input
            id="dbt-payment"
            name="payment"
            inputMode="decimal"
            required
            defaultValue={
              editing ? centsToInput(editing.monthlyPaymentCents) : ""
            }
            placeholder="0,00"
          />
        </Field>
        <Field label="Moneda" htmlFor="dbt-currency">
          <CurrencySelect id="dbt-currency" value={editing?.currency} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3 *:min-w-0">
        <Field label="TIN %" htmlFor="dbt-rate">
          <Input
            id="dbt-rate"
            name="rate"
            inputMode="decimal"
            defaultValue={bpsToInput(editing?.annualRateBps)}
            placeholder="0"
          />
        </Field>
        <Field label="TAE %" htmlFor="dbt-apr">
          <Input
            id="dbt-apr"
            name="apr"
            inputMode="decimal"
            defaultValue={bpsToInput(editing?.aprBps)}
          />
        </Field>
        <Field label="Día de cobro" htmlFor="dbt-day">
          <Input
            id="dbt-day"
            name="day"
            type="number"
            min={1}
            max={31}
            defaultValue={editing?.paymentDay ?? ""}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <Field label="Capital inicial" htmlFor="dbt-principal">
          <Input
            id="dbt-principal"
            name="principal"
            inputMode="decimal"
            defaultValue={
              editing?.principalCents
                ? centsToInput(editing.principalCents)
                : ""
            }
          />
        </Field>
        <Field label="Límite (tarjetas)" htmlFor="dbt-limit">
          <Input
            id="dbt-limit"
            name="limit"
            inputMode="decimal"
            defaultValue={
              editing?.creditLimitCents
                ? centsToInput(editing.creditLimitCents)
                : ""
            }
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <Field label="Entidad" htmlFor="dbt-lender">
          <Input
            id="dbt-lender"
            name="lender"
            defaultValue={editing?.lender ?? ""}
          />
        </Field>
        <Field label="Termina" htmlFor="dbt-ends">
          <Input
            id="dbt-ends"
            name="ends"
            type="date"
            defaultValue={editing?.endsOn ?? ""}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <Field label="Comercio en el banco" htmlFor="dbt-merchant">
          <Input
            id="dbt-merchant"
            name="merchant"
            defaultValue={editing?.merchant ?? ""}
          />
        </Field>
        <Field label="Ámbito" htmlFor="dbt-scope">
          <ScopeSelect id="dbt-scope" value={editing?.scope} />
        </Field>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        El comercio con el que salen las cuotas en Movimientos: así no se
        cuentan dos veces en la previsión.
      </p>
      <Field label="Notas" htmlFor="dbt-notes">
        <Textarea
          id="dbt-notes"
          name="notes"
          rows={2}
          defaultValue={editing?.notes ?? ""}
        />
      </Field>
      <label className="flex items-center justify-between text-sm">
        Activa
        <Switch name="active" defaultChecked={editing?.isActive ?? true} />
      </label>
    </FormDialog>
  );
}

// ── Savings goals ────────────────────────────────────────────────────────────

function GoalsSection({ scope }: { scope?: Scope }) {
  const goals = api.finance.planning.goals.list.useQuery();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  return (
    <Section
      title="Objetivos de ahorro"
      description="Fondo de emergencia, independizarte… El progreso sale del saldo de las huchas vinculadas."
      action={
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Nuevo
        </Button>
      }
    >
      <ListBox
        items={goals.data?.filter((item) => !scope || item.scope === scope)}
        error={goals.error?.message}
        empty="Sin objetivos todavía."
      >
        {(g) => (
          <Row
            key={g.id}
            onClick={() => setEditing(g)}
            muted={g.isArchived}
            title={g.name}
            subtitle={[
              g.linkedAccounts.length ? g.linkedAccounts.join(", ") : "manual",
              g.targetOn &&
                (g.targetOn < new Date().toISOString().slice(0, 10)
                  ? `la fecha (${day(g.targetOn)}) ya pasó`
                  : `para ${day(g.targetOn)}`),
              g.monthlyNeededCents !== null &&
                g.remainingCents > 0 &&
                g.monthsLeft !== null &&
                g.monthsLeft > 0 &&
                `${money(g.monthlyNeededCents)}/mes para llegar`,
            ]
              .filter(Boolean)
              .join(" · ")}
            amount={`${money(g.currentCents)} / ${money(g.targetCents)}`}
            amountNote={`${Math.round(g.progress * 100)}%`}
          >
            <Progress
              value={Math.max(0, Math.min(100, g.progress * 100))}
              className="mt-2 h-1"
            />
          </Row>
        )}
      </ListBox>
      <GoalDialog goal={editing} onClose={() => setEditing(null)} />
    </Section>
  );
}

function GoalDialog({
  goal,
  onClose,
}: {
  goal: Goal | "new" | null;
  onClose: () => void;
}) {
  const editing = goal && goal !== "new" ? goal : null;
  const accounts = api.finance.accounts.list.useQuery();
  const done = useDone(onClose);
  const save = api.finance.planning.goals.save.useMutation(done);
  const remove = api.finance.planning.goals.delete.useMutation(done);
  return (
    <FormDialog
      open={goal !== null}
      title={editing ? editing.name : "Nuevo objetivo"}
      formKey={editing?.id ?? "new"}
      onClose={onClose}
      pending={save.isPending || remove.isPending}
      onDelete={editing ? () => remove.mutate({ id: editing.id }) : undefined}
      onSubmit={(f) => {
        const target = readCents(f, "target");
        const saved = readCents(f, "saved", {
          allowZero: true,
          optional: true,
        });
        if (target === undefined || target === null || saved === undefined)
          return;
        const accountIds = f.getAll("accounts").map(String);
        save.mutate({
          id: editing?.id,
          name: formText(f, "name"),
          targetCents: target,
          savedCents: saved ?? 0,
          accountIds: accountIds.length ? accountIds : null,
          targetOn: formText(f, "date") || null,
          scope: formText(f, "scope") as Scope,
          notes: formText(f, "notes") || null,
          isArchived: f.get("archived") === "on",
        });
      }}
    >
      <Field label="Nombre" htmlFor="gol-name">
        <Input
          id="gol-name"
          name="name"
          required
          defaultValue={editing?.name}
          placeholder="Fondo de emergencia"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <Field label="Objetivo (EUR)" htmlFor="gol-target">
          <Input
            id="gol-target"
            name="target"
            inputMode="decimal"
            required
            defaultValue={editing ? centsToInput(editing.targetCents) : ""}
          />
        </Field>
        <Field label="Fecha objetivo" htmlFor="gol-date">
          <Input
            id="gol-date"
            name="date"
            type="date"
            defaultValue={editing?.targetOn ?? ""}
          />
        </Field>
      </div>
      <div className="space-y-2">
        <Label>Cuentas o huchas vinculadas</Label>
        <div className="bg-muted max-h-40 space-y-1 overflow-y-auto rounded-lg p-2">
          {(accounts.data?.items ?? []).map((a) => (
            <label
              key={a.id}
              className="flex items-center gap-2 px-1 py-1 text-sm"
            >
              <Checkbox
                name="accounts"
                value={a.id}
                defaultChecked={editing?.accountIds?.includes(a.id)}
              />
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {money(a.balanceCents, a.currency)}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <Field label="Ahorrado (sin cuentas)" htmlFor="gol-saved">
          <Input
            id="gol-saved"
            name="saved"
            inputMode="decimal"
            defaultValue={editing ? centsToInput(editing.savedCents) : ""}
          />
        </Field>
        <Field label="Ámbito" htmlFor="gol-scope">
          <ScopeSelect id="gol-scope" value={editing?.scope} />
        </Field>
      </div>
      <Field label="Notas" htmlFor="gol-notes">
        <Textarea
          id="gol-notes"
          name="notes"
          rows={2}
          defaultValue={editing?.notes ?? ""}
        />
      </Field>
      <label className="flex items-center justify-between text-sm">
        Archivado (cumplido o abandonado)
        <Switch name="archived" defaultChecked={editing?.isArchived ?? false} />
      </label>
    </FormDialog>
  );
}

// ── Budgets ──────────────────────────────────────────────────────────────────

function BudgetsSection({ scope }: { scope?: Scope }) {
  const month = monthKey();
  const budgets = api.finance.planning.budgets.list.useQuery({ month });
  const [editing, setEditing] = useState<Budget | "new" | null>(null);
  return (
    <Section
      title="Presupuestos del mes"
      description="Límite mensual por categoría, con los reembolsos ya restados."
      action={
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Nuevo
        </Button>
      }
    >
      <ListBox
        items={budgets.data?.filter((item) => !scope || item.scope === scope)}
        error={budgets.error?.message}
        empty="Sin presupuestos todavía."
      >
        {(b) => {
          const over = b.remainingCents < 0;
          return (
            <Row
              key={b.id}
              onClick={() => setEditing(b)}
              title={b.category}
              subtitle={
                over
                  ? `Te has pasado ${money(-b.remainingCents)}`
                  : `Quedan ${money(b.remainingCents)}${b.pace > 1.1 ? " · vas más rápido que el mes" : ""}`
              }
              amount={`${money(b.spentCents)} / ${money(b.monthlyCents)}`}
              amountNote={`${Math.round(b.used * 100)}%`}
            >
              <Progress
                value={Math.max(0, Math.min(100, b.used * 100))}
                className={`mt-2 h-1 ${over ? "[&>div]:bg-destructive" : ""}`}
              />
            </Row>
          );
        }}
      </ListBox>
      <BudgetDialog
        budget={editing}
        taken={(budgets.data ?? []).map((b) => b.categoryId)}
        onClose={() => setEditing(null)}
      />
    </Section>
  );
}

function BudgetDialog({
  budget,
  taken,
  onClose,
}: {
  budget: Budget | "new" | null;
  taken: string[];
  onClose: () => void;
}) {
  const editing = budget && budget !== "new" ? budget : null;
  const categories = api.finance.categories.list.useQuery();
  const done = useDone(onClose);
  const save = api.finance.planning.budgets.save.useMutation(done);
  const remove = api.finance.planning.budgets.delete.useMutation(done);
  const options = (categories.data ?? []).filter(
    (c) =>
      c.kind === "expense" &&
      (c.id === editing?.categoryId || !taken.includes(c.id)),
  );
  return (
    <FormDialog
      open={budget !== null}
      title={
        editing ? `Presupuesto · ${editing.category}` : "Nuevo presupuesto"
      }
      formKey={editing?.id ?? "new"}
      onClose={onClose}
      pending={save.isPending || remove.isPending}
      onDelete={
        editing
          ? () => remove.mutate({ categoryId: editing.categoryId })
          : undefined
      }
      onSubmit={(f) => {
        const cents = readCents(f, "amount");
        if (cents === undefined || cents === null || cents < 0) return;
        save.mutate({
          categoryId: formText(f, "category"),
          monthlyCents: cents,
        });
      }}
    >
      <Field label="Categoría" htmlFor="bud-category">
        <NativeSelect
          id="bud-category"
          name="category"
          required
          disabled={!!editing}
          defaultValue={editing?.categoryId ?? options[0]?.id}
          className="w-full"
        >
          {options.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {editing && (
          <input type="hidden" name="category" value={editing.categoryId} />
        )}
      </Field>
      <Field label="Límite al mes (EUR)" htmlFor="bud-amount">
        <Input
          id="bud-amount"
          name="amount"
          inputMode="decimal"
          required
          defaultValue={editing ? centsToInput(editing.monthlyCents) : ""}
        />
      </Field>
    </FormDialog>
  );
}

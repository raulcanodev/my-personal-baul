"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  Calendar,
  Check,
  Landmark,
  Plus,
  Shapes,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, type RouterOutputs } from "@/trpc/react";
import { money, parseCents, shortDate, formText } from "../format";
import { PageHeader } from "../page-header";
import { TableToolbar } from "../table/table-toolbar";
import {
  getActiveFilter,
  getSelectedFilterValues,
  isDateRangeValue,
  type ActiveFilter,
  type DateRangePreset,
  type FilterField,
} from "../table/table-filters";

type Transaction =
  RouterOutputs["finance"]["transactions"]["list"]["items"][number];
type Category = RouterOutputs["finance"]["categories"]["list"][number];

const UNCATEGORIZED = "__none";
const PAGE = 50;

// Filters live in the URL so they survive reloads, the back button and shared links
const PARAM: Record<string, string> = {
  account: "cuenta",
  category: "categoria",
  scope: "ambito",
  direction: "tipo",
};

function filtersFromParams(params: URLSearchParams): ActiveFilter[] {
  const filters: ActiveFilter[] = [];
  for (const [fieldId, key] of Object.entries(PARAM)) {
    const raw = params.get(key);
    if (raw) filters.push({ fieldId, value: raw.split(",") });
  }
  const from = params.get("desde");
  const to = params.get("hasta");
  if (from && to) {
    filters.push({
      fieldId: "date",
      value: {
        from,
        to,
        preset: (params.get("periodo") as DateRangePreset) ?? undefined,
      },
    });
  }
  return filters;
}

function paramsFromFilters(filters: ActiveFilter[], search: string) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  for (const filter of filters) {
    if (isDateRangeValue(filter.value)) {
      params.set("desde", filter.value.from);
      params.set("hasta", filter.value.to);
      if (filter.value.preset) params.set("periodo", filter.value.preset);
    } else if (Array.isArray(filter.value) && PARAM[filter.fieldId]) {
      params.set(PARAM[filter.fieldId]!, filter.value.join(","));
    }
  }
  return params;
}

export function TransactionsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(searchParams)),
    [searchParams],
  );
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [debounced, setDebounced] = useState(search);
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const update = (next: ActiveFilter[], q = search) => {
    setLimit(PAGE);
    const params = paramsFromFilters(next, q).toString();
    router.replace(params ? `${pathname}?${params}` : pathname, {
      scroll: false,
    });
  };
  useEffect(() => {
    if ((searchParams.get("q") ?? "") !== debounced) update(filters, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const accounts = api.finance.accounts.list.useQuery();
  const categories = api.finance.categories.list.useQuery();

  const selectedCategories = getSelectedFilterValues(filters, "category");
  const dateRange = getActiveFilter(filters, "date")?.value;
  const scope = getSelectedFilterValues(filters, "scope")[0] as
    "personal" | "work" | undefined;
  const direction = getSelectedFilterValues(filters, "direction")[0] as
    "in" | "out" | undefined;
  const query = api.finance.transactions.list.useQuery(
    {
      search: debounced || undefined,
      accountIds: getSelectedFilterValues(filters, "account"),
      categoryIds: selectedCategories.filter((c) => c !== UNCATEGORIZED),
      uncategorized: selectedCategories.includes(UNCATEGORIZED) || undefined,
      scope,
      direction,
      from: isDateRangeValue(dateRange) ? dateRange.from : undefined,
      to: isDateRangeValue(dateRange) ? dateRange.to : undefined,
      limit,
    },
    { placeholderData: (previous) => previous },
  );

  const fields: FilterField[] = [
    {
      id: "account",
      type: "multi-select",
      label: "Cuenta",
      icon: Landmark,
      options: (accounts.data?.items ?? []).map((a) => ({
        value: a.id,
        label: a.name,
        description: a.provider
          ? `${a.provider} · ${a.currency}`
          : `Manual · ${a.currency}`,
      })),
    },
    {
      id: "category",
      type: "multi-select",
      label: "Categoría",
      icon: Tag,
      searchable: true,
      options: [
        { value: UNCATEGORIZED, label: "Sin categoría" },
        ...(categories.data ?? []).map((c) => ({
          value: c.id,
          label: c.name,
          icon: (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: c.color }}
            />
          ),
        })),
      ],
    },
    {
      id: "scope",
      type: "select",
      label: "Ámbito",
      icon: Shapes,
      options: [
        { value: "personal", label: "Personal" },
        { value: "work", label: "Trabajo" },
      ],
    },
    {
      id: "direction",
      type: "select",
      label: "Tipo",
      icon: ArrowDownUp,
      options: [
        { value: "out", label: "Gastos" },
        { value: "in", label: "Ingresos" },
      ],
    },
    {
      id: "date",
      type: "date-range",
      label: "Fecha",
      icon: Calendar,
      presets: [
        "this_month",
        "last_month",
        "last_30",
        "this_year",
        "last_year",
      ],
    },
  ];

  const data = query.data;

  return (
    <>
      <PageHeader
        title="Movimientos"
        actions={
          <Button
            onClick={() => setCreating(true)}
            disabled={!accounts.data?.items.length}
          >
            <Plus className="size-4" />
            Añadir movimiento
          </Button>
        }
      />

      <section className="mt-9">
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar concepto o comercio"
          searchLoading={query.isFetching}
          fields={fields}
          filters={filters}
          onFiltersChange={(next) => update(next)}
        />

        {data && (
          <div className="text-muted-foreground mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{data.count} movimientos</span>
            <span>Entradas {money(data.inCents)}</span>
            <span>Salidas {money(data.outCents)}</span>
          </div>
        )}

        <div className="bg-muted overflow-hidden rounded-xl">
          {query.isError && !data ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              No se pudo cargar la búsqueda.{" "}
              <button
                className="text-foreground underline"
                onClick={() => void query.refetch()}
              >
                Reintentar
              </button>
            </p>
          ) : !data ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton
                  key={i}
                  className="bg-background/70 h-14 rounded-lg"
                />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              {accounts.data?.items.length
                ? "No hay movimientos para esta selección."
                : "Conecta Wise o Mercury en Cuentas, o crea una cuenta manual, para empezar."}
            </p>
          ) : (
            <ul className="divide-background divide-y">
              {data.items.map((t) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  categories={categories.data ?? []}
                />
              ))}
            </ul>
          )}
        </div>
        {data && data.items.length < data.count && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              onClick={() => setLimit((l) => l + PAGE)}
              disabled={query.isFetching}
            >
              Ver más
            </Button>
          </div>
        )}
      </section>

      <CreateTransactionDialog
        open={creating}
        onOpenChange={setCreating}
        accounts={accounts.data?.items ?? []}
        categories={categories.data ?? []}
      />
    </>
  );
}

function TransactionRow({
  transaction: t,
  categories,
}: {
  transaction: Transaction;
  categories: Category[];
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(true);
  const categorize = api.finance.transactions.categorize.useMutation({
    onSuccess: async () => {
      setOpen(false);
      await utils.finance.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.finance.transactions.deleteManual.useMutation({
    onSuccess: () => utils.finance.invalidate(),
  });
  // Manual entries use their own id as external id; synced ones would come back on the next sync
  const isManual = t.externalId === t.id;

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{t.counterparty ?? t.description}</p>
        <p className="text-muted-foreground truncate text-xs">
          {shortDate(t.date)} · {t.accountName}
          {t.counterparty &&
            t.description !== t.counterparty &&
            ` · ${t.description}`}
          {t.status === "pending" && " · pendiente"}
          {t.isOneOff && " · puntual"}
        </p>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={`flex max-w-28 shrink-0 items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs sm:max-w-40 ${t.categoryId ? "bg-background" : "border-foreground/30 text-muted-foreground border border-dashed"}`}
          >
            {t.categoryColor && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: t.categoryColor }}
              />
            )}
            {t.categoryName ?? "Categorizar"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1.5">
          <div className="max-h-64 overflow-y-auto">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={categorize.isPending}
                onClick={() =>
                  categorize.mutate({
                    id: t.id,
                    categoryId: c.id,
                    rememberMerchant: remember,
                  })
                }
                className="hover:bg-muted flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: c.color }}
                />
                <span className="flex-1">{c.name}</span>
                {c.id === t.categoryId && <Check className="size-4" />}
              </button>
            ))}
          </div>
          {t.amountCents < 0 && (
            <label className="mt-1 flex items-center justify-between gap-2 border-t px-2 pt-2 text-xs">
              <span className="text-muted-foreground">
                Gasto puntual{" "}
                <span className="text-muted-foreground/70">
                  (fuera de la media de la previsión)
                </span>
              </span>
              <Switch
                checked={t.isOneOff}
                disabled={categorize.isPending}
                onCheckedChange={(isOneOff) =>
                  categorize.mutate({ id: t.id, isOneOff })
                }
              />
            </label>
          )}
          {t.merchant && (
            <label className="mt-1 flex items-center justify-between gap-2 border-t px-2 pt-2 text-xs">
              <span className="text-muted-foreground">
                Siempre así para{" "}
                <span className="text-foreground">{t.merchant}</span>
              </span>
              <Switch checked={remember} onCheckedChange={setRemember} />
            </label>
          )}
        </PopoverContent>
      </Popover>
      <span
        className={`w-24 shrink-0 text-right text-sm tabular-nums ${t.amountCents > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}
      >
        {money(t.amountCents, t.currency, { sign: true })}
      </span>
      {isManual && (
        <button
          aria-label="Eliminar"
          onClick={() => remove.mutate({ id: t.id })}
        >
          <Trash2 className="text-muted-foreground size-4" />
        </button>
      )}
    </li>
  );
}

function CreateTransactionDialog({
  open,
  onOpenChange,
  accounts,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: RouterOutputs["finance"]["accounts"]["list"]["items"];
  categories: Category[];
}) {
  const utils = api.useUtils();
  const [kind, setKind] = useState<"out" | "in">("out");
  const create = api.finance.transactions.createManual.useMutation({
    onSuccess: async () => {
      onOpenChange(false);
      toast.success("Movimiento añadido");
      await utils.finance.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo movimiento</DialogTitle>
          <DialogDescription className="sr-only">
            Movimiento manual
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const cents = parseCents(formText(f, "amount"));
            if (!Number.isFinite(cents) || cents <= 0) {
              toast.error("Importe no válido");
              return;
            }
            create.mutate({
              accountId: formText(f, "account"),
              date: formText(f, "date"),
              description: formText(f, "description"),
              amountCents: kind === "out" ? -cents : cents,
              categoryId: formText(f, "category") || null,
            });
          }}
        >
          <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
            {(["out", "in"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`h-9 rounded-md text-sm ${kind === k ? "bg-background shadow-xs" : "text-muted-foreground"}`}
              >
                {k === "out" ? "Gasto" : "Ingreso"}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-description">Concepto</Label>
            <Input
              id="tx-description"
              name="description"
              required
              placeholder="Café con amigos"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 *:min-w-0">
            <div className="space-y-2">
              <Label htmlFor="tx-amount">Importe</Label>
              <Input
                id="tx-amount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-date">Fecha</Label>
              <Input
                id="tx-date"
                name="date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 *:min-w-0">
            <div className="space-y-2">
              <Label htmlFor="tx-account">Cuenta</Label>
              <NativeSelect id="tx-account" name="account" className="w-full">
                {accounts.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-category">Categoría</Label>
              <NativeSelect id="tx-category" name="category" className="w-full">
                <NativeSelectOption value="">Sin categoría</NativeSelectOption>
                {categories.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  Briefcase,
  CircleDot,
  Heart,
  Plus,
  RefreshCw,
  Repeat,
  Shapes,
  Tag,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, type RouterOutputs } from "@/trpc/react";
import {
  CYCLE_LABEL,
  SCOPE_LABEL,
  centsToInput,
  money,
  parseCents,
  shortDate,
  formText,
} from "../format";
import { PageHeader, StatCard } from "../page-header";
import { TableToolbar } from "../table/table-toolbar";
import {
  matchesSelectedFilter,
  type ActiveFilter,
  type FilterField,
} from "../table/table-filters";

type Subscription =
  RouterOutputs["finance"]["subscriptions"]["list"]["items"][number];
type Category = RouterOutputs["finance"]["categories"]["list"][number];

export function SubscriptionsView() {
  const subs = api.finance.subscriptions.list.useQuery();
  const categories = api.finance.categories.list.useQuery();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>([
    { fieldId: "status", value: ["active"] },
  ]);
  const [editing, setEditing] = useState<Subscription | "new" | null>(null);

  const fields: FilterField[] = [
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
      id: "category",
      type: "multi-select",
      label: "Categoría",
      icon: Tag,
      options: (categories.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        icon: (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: c.color }}
          />
        ),
      })),
    },
    {
      id: "cycle",
      type: "multi-select",
      label: "Ciclo",
      icon: RefreshCw,
      options: Object.entries(CYCLE_LABEL).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      id: "status",
      type: "select",
      label: "Estado",
      icon: CircleDot,
      options: [
        { value: "active", label: "Activas" },
        { value: "inactive", label: "Canceladas" },
      ],
    },
  ];

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (subs.data?.items ?? [])
      .filter(
        (s) =>
          !needle ||
          `${s.name} ${s.notes ?? ""}`.toLowerCase().includes(needle),
      )
      .filter((s) => matchesSelectedFilter(filters, "scope", s.scope))
      .filter((s) => matchesSelectedFilter(filters, "category", s.categoryId))
      .filter((s) => matchesSelectedFilter(filters, "cycle", s.cycle))
      .filter((s) =>
        matchesSelectedFilter(
          filters,
          "status",
          s.isActive ? "active" : "inactive",
        ),
      )
      .sort((a, b) => b.monthlyBaseCents - a.monthlyBaseCents);
  }, [subs.data, search, filters]);

  const summary = subs.data?.summary;
  const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title="Suscripciones"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Nueva suscripción
          </Button>
        }
      />

      <div className="mt-9 grid gap-3 sm:grid-cols-3">
        {!summary ? (
          Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              inverted
              label="Al mes"
              value={money(summary.monthlyCents)}
              note={`${money(summary.yearlyCents)} al año · ${summary.activeCount} activas`}
              icon={<Repeat className="size-4" />}
            />
            <StatCard
              label="Trabajo"
              value={money(summary.workMonthlyCents)}
              icon={<Briefcase className="size-4" />}
            />
            <StatCard
              label="Personal"
              value={money(summary.personalMonthlyCents)}
              icon={<Heart className="size-4" />}
            />
          </>
        )}
      </div>

      <section className="mt-10">
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar suscripción"
          fields={fields}
          filters={filters}
          onFiltersChange={setFilters}
        />
        <div className="bg-muted overflow-hidden rounded-xl">
          {!subs.data ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton
                  key={i}
                  className="bg-background/70 h-14 rounded-lg"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              {subs.data.items.length === 0
                ? "Sin suscripciones todavía."
                : "Nada con estos filtros."}
            </p>
          ) : (
            <ul className="divide-background divide-y">
              {visible.map((s) => {
                const category = s.categoryId
                  ? categoryById.get(s.categoryId)
                  : undefined;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setEditing(s)}
                      className={`hover:bg-foreground/[0.03] flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5 ${s.isActive ? "" : "opacity-50"}`}
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-medium text-white"
                        style={{ background: category?.color ?? "#a8a29e" }}
                      >
                        {s.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{s.name}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {SCOPE_LABEL[s.scope]}
                          {category && ` · ${category.name}`}
                          {s.nextChargeOn &&
                            ` · próximo cobro ${shortDate(s.nextChargeOn)}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm tabular-nums">
                          {money(s.amountCents, s.currency)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {CYCLE_LABEL[s.cycle].toLowerCase()}
                          {s.cycle !== "monthly" &&
                            ` · ${money(s.monthlyBaseCents)}/mes`}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <SubscriptionDialog
        subscription={editing}
        categories={categories.data ?? []}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function SubscriptionDialog({
  subscription,
  categories,
  onClose,
}: {
  subscription: Subscription | "new" | null;
  categories: Category[];
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const editing = subscription && subscription !== "new" ? subscription : null;
  const done = async (message: string) => {
    toast.success(message);
    onClose();
    await utils.finance.invalidate();
  };
  const create = api.finance.subscriptions.create.useMutation({
    onSuccess: () => done("Suscripción guardada"),
    onError: (e) => toast.error(e.message),
  });
  const update = api.finance.subscriptions.update.useMutation({
    onSuccess: () => done("Cambios guardados"),
    onError: (e) => toast.error(e.message),
  });
  const remove = api.finance.subscriptions.delete.useMutation({
    onSuccess: () => done("Suscripción eliminada"),
  });

  return (
    <Dialog
      open={subscription !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? editing.name : "Nueva suscripción"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Datos de la suscripción
          </DialogDescription>
        </DialogHeader>
        <form
          key={editing?.id ?? "new"}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const amountCents = parseCents(formText(f, "amount"));
            if (!Number.isFinite(amountCents) || amountCents <= 0) {
              toast.error("Importe no válido");
              return;
            }
            const input = {
              name: formText(f, "name"),
              amountCents,
              currency: formText(f, "currency"),
              cycle: formText(f, "cycle") as Subscription["cycle"],
              scope: formText(f, "scope") as Subscription["scope"],
              categoryId: formText(f, "category") || null,
              nextChargeOn: formText(f, "next") || null,
              isActive: f.get("active") === "on",
              url: formText(f, "url") || null,
              notes: formText(f, "notes") || null,
            };
            if (editing) update.mutate({ id: editing.id, ...input });
            else create.mutate(input);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="sub-name">Nombre</Label>
            <Input
              id="sub-name"
              name="name"
              required
              defaultValue={editing?.name}
              placeholder="Claude, Hetzner, Netflix…"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] gap-3 *:min-w-0">
            <div className="space-y-2">
              <Label htmlFor="sub-amount">Importe</Label>
              <Input
                id="sub-amount"
                name="amount"
                inputMode="decimal"
                required
                defaultValue={editing ? centsToInput(editing.amountCents) : ""}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-currency">Moneda</Label>
              <NativeSelect
                id="sub-currency"
                name="currency"
                defaultValue={editing?.currency ?? "EUR"}
                className="w-full"
              >
                {["EUR", "USD", "GBP"].map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-cycle">Ciclo</Label>
              <NativeSelect
                id="sub-cycle"
                name="cycle"
                defaultValue={editing?.cycle ?? "monthly"}
                className="w-full"
              >
                {Object.entries(CYCLE_LABEL).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 *:min-w-0">
            <div className="space-y-2">
              <Label htmlFor="sub-scope">Ámbito</Label>
              <NativeSelect
                id="sub-scope"
                name="scope"
                defaultValue={editing?.scope ?? "work"}
                className="w-full"
              >
                <NativeSelectOption value="work">Trabajo</NativeSelectOption>
                <NativeSelectOption value="personal">
                  Personal
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-category">Categoría</Label>
              <NativeSelect
                id="sub-category"
                name="category"
                defaultValue={editing?.categoryId ?? ""}
                className="w-full"
              >
                <NativeSelectOption value="">Sin categoría</NativeSelectOption>
                {categories
                  .filter((c) => c.kind === "expense")
                  .map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 *:min-w-0">
            <div className="space-y-2">
              <Label htmlFor="sub-next">Próximo cobro</Label>
              <Input
                id="sub-next"
                name="next"
                type="date"
                defaultValue={editing?.nextChargeOn ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-url">Web</Label>
              <Input
                id="sub-url"
                name="url"
                type="url"
                defaultValue={editing?.url ?? ""}
                placeholder="https://"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-notes">Notas</Label>
            <Textarea
              id="sub-notes"
              name="notes"
              rows={2}
              defaultValue={editing?.notes ?? ""}
            />
          </div>
          <label className="flex items-center justify-between text-sm">
            Activa
            <Switch name="active" defaultChecked={editing?.isActive ?? true} />
          </label>
          <DialogFooter className="gap-2">
            {editing && (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                onClick={() => remove.mutate({ id: editing.id })}
              >
                Eliminar
              </Button>
            )}
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

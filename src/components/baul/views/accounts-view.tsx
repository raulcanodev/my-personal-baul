"use client";

import { useState } from "react";
import {
  Landmark,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Wallet,
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
import { api, type RouterOutputs } from "@/trpc/react";
import {
  SCOPE_LABEL,
  centsToInput,
  money,
  parseCents,
  relativeTime,
  formText,
} from "../format";
import { PageHeader, StatCard } from "../page-header";

type Account = RouterOutputs["finance"]["accounts"]["list"]["items"][number];

export function AccountsView() {
  const accounts = api.finance.accounts.list.useQuery();
  const connections = api.finance.connections.list.useQuery();
  const [dialog, setDialog] = useState<"bank" | "manual" | Account | null>(
    null,
  );
  const items = accounts.data?.items ?? [];
  const byCurrency = items.reduce<Record<string, number>>((acc, a) => {
    acc[a.currency] = (acc[a.currency] ?? 0) + a.balanceCents;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Cuentas."
        subtitle="Cada cosa en su lugar."
        description="Wise y Mercury se actualizan solos cada día. El resto, a mano."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog("manual")}>
              <Plus className="size-4" />
              Cuenta manual
            </Button>
            <Button onClick={() => setDialog("bank")}>
              <Link2 className="size-4" />
              Conectar banco
            </Button>
          </>
        }
      />

      <div className="mt-9 grid gap-3 sm:grid-cols-3">
        {!accounts.data ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <>
            <StatCard
              inverted
              label="Dinero total"
              value={money(accounts.data.totalCents)}
              note="Todo convertido a euros al cambio de hoy"
              icon={<Wallet className="size-4" />}
            />
            {Object.entries(byCurrency)
              .filter(
                ([currency]) =>
                  currency !== "EUR" || Object.keys(byCurrency).length > 1,
              )
              .slice(0, 2)
              .map(([currency, cents]) => (
                <StatCard
                  key={currency}
                  label={`En ${currency}`}
                  value={money(cents, currency)}
                  note={`${items.filter((a) => a.currency === currency).length} cuentas`}
                />
              ))}
          </>
        )}
      </div>

      {(connections.data ?? []).map((connection) => (
        <ConnectionSection
          key={connection.id}
          connection={connection}
          accounts={items.filter((a) => a.connectionId === connection.id)}
          onEdit={setDialog}
        />
      ))}

      <section className="mt-10">
        <h2 className="text-lg font-medium tracking-tight">Cuentas manuales</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Efectivo, otros bancos, lo que no tiene API.
        </p>
        <AccountList
          accounts={items.filter((a) => !a.connectionId)}
          onEdit={setDialog}
          empty="Ninguna todavía."
        />
      </section>

      <ConnectBankDialog
        open={dialog === "bank"}
        onOpenChange={(o) => setDialog(o ? "bank" : null)}
      />
      <AccountDialog
        account={
          dialog === "manual"
            ? "new"
            : typeof dialog === "object"
              ? dialog
              : null
        }
        onClose={() => setDialog(null)}
      />
    </>
  );
}

function ConnectionSection({
  connection,
  accounts,
  onEdit,
}: {
  connection: RouterOutputs["finance"]["connections"]["list"][number];
  accounts: Account[];
  onEdit: (a: Account) => void;
}) {
  const utils = api.useUtils();
  const sync = api.finance.connections.sync.useMutation({
    onSuccess: async (r) => {
      toast.success(
        `${connection.name} al día · ${r.syncedCount} movimientos revisados`,
      );
      await utils.finance.invalidate();
    },
    onError: async (e) => {
      toast.error(e.message);
      await utils.finance.connections.invalidate();
    },
  });
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight">
            <Landmark className="size-4" />
            {connection.name}
            <span className="text-muted-foreground text-xs font-normal capitalize">
              {connection.provider}
            </span>
          </h2>
          <p
            className={`mt-1 text-xs ${connection.lastError ? "text-red-700" : "text-muted-foreground"}`}
          >
            {connection.lastError
              ? `Último intento falló: ${connection.lastError}`
              : `Sincronizado ${relativeTime(connection.lastSyncedAt)}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={sync.isPending}
          onClick={() => sync.mutate({ id: connection.id })}
        >
          {sync.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sincronizar
        </Button>
      </div>
      <AccountList
        accounts={accounts}
        onEdit={onEdit}
        empty="Sin cuentas todavía: sincroniza."
      />
    </section>
  );
}

function AccountList({
  accounts,
  onEdit,
  empty,
}: {
  accounts: Account[];
  onEdit: (a: Account) => void;
  empty: string;
}) {
  return (
    <div className="bg-muted mt-4 overflow-hidden rounded-xl">
      {accounts.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          {empty}
        </p>
      ) : (
        <ul className="divide-background divide-y">
          {accounts.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => onEdit(a)}
                className="hover:bg-foreground/[0.03] flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {SCOPE_LABEL[a.scope]} · {a.currency}
                    {a.balanceUpdatedAt &&
                      ` · ${relativeTime(a.balanceUpdatedAt)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">
                    {money(a.balanceCents, a.currency)}
                  </p>
                  {a.currency !== "EUR" && (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      ≈ {money(a.baseBalanceCents)}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConnectBankDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const utils = api.useUtils();
  const [provider, setProvider] = useState<"wise" | "mercury">("wise");
  const add = api.finance.connections.add.useMutation({
    onSuccess: async (r) => {
      toast.success(
        `Conectado · ${r.accounts} cuentas, ${r.syncedCount} movimientos`,
      );
      onOpenChange(false);
      await utils.finance.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar un banco.</DialogTitle>
          <DialogDescription>
            {provider === "wise"
              ? "Wise → Ajustes → Tokens de API. Un token de solo lectura es suficiente."
              : "Mercury → Settings → API Tokens. Uno de solo lectura es suficiente."}{" "}
            La clave se guarda cifrada y no se vuelve a mostrar.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            add.mutate({
              provider,
              name: formText(f, "name"),
              apiKey: formText(f, "apiKey").trim(),
            });
          }}
        >
          <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
            {(["wise", "mercury"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`h-9 rounded-md text-sm capitalize ${provider === p ? "bg-background shadow-xs" : "text-muted-foreground"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-name">Nombre</Label>
            <Input
              id="bank-name"
              name="name"
              required
              key={provider}
              defaultValue={provider === "wise" ? "Wise" : "Mercury"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-key">API key</Label>
            <Input
              id="bank-key"
              name="apiKey"
              type="password"
              required
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="size-4 animate-spin" />}
              Conectar y sincronizar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({
  account,
  onClose,
}: {
  account: Account | "new" | null;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const editing = account && account !== "new" ? account : null;
  const done = async () => {
    onClose();
    await utils.finance.invalidate();
  };
  const create = api.finance.accounts.createManual.useMutation({
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  const update = api.finance.accounts.update.useMutation({
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  const synced = !!editing?.connectionId;

  return (
    <Dialog open={account !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? editing.name : "Cuenta manual."}</DialogTitle>
          <DialogDescription>
            {synced
              ? "El saldo llega del banco; aquí solo cambias cómo se ve."
              : "Actualiza el saldo cuando quieras: queda guardado en el histórico."}
          </DialogDescription>
        </DialogHeader>
        <form
          key={editing?.id ?? "new"}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const name = formText(f, "name");
            const scope = formText(f, "scope") as Account["scope"];
            const balanceCents = synced
              ? undefined
              : parseCents(formText(f, "balance") || "0");
            if (balanceCents !== undefined && !Number.isFinite(balanceCents)) {
              toast.error("Saldo no válido");
              return;
            }
            if (editing)
              update.mutate({ id: editing.id, name, scope, balanceCents });
            else
              create.mutate({
                name,
                scope,
                currency: formText(f, "currency"),
                balanceCents: balanceCents ?? 0,
              });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="acc-name">Nombre</Label>
            <Input
              id="acc-name"
              name="name"
              required
              defaultValue={editing?.name}
              placeholder="Efectivo, ING, Revolut…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="acc-scope">Ámbito</Label>
              <NativeSelect
                id="acc-scope"
                name="scope"
                defaultValue={editing?.scope ?? "personal"}
                className="w-full [&_select]:h-9"
              >
                <NativeSelectOption value="personal">
                  Personal
                </NativeSelectOption>
                <NativeSelectOption value="work">Trabajo</NativeSelectOption>
              </NativeSelect>
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="acc-currency">Moneda</Label>
                <NativeSelect
                  id="acc-currency"
                  name="currency"
                  defaultValue="EUR"
                  className="w-full [&_select]:h-9"
                >
                  {["EUR", "USD", "GBP"].map((c) => (
                    <NativeSelectOption key={c} value={c}>
                      {c}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          {!synced && (
            <div className="space-y-2">
              <Label htmlFor="acc-balance">Saldo actual</Label>
              <Input
                id="acc-balance"
                name="balance"
                inputMode="decimal"
                defaultValue={editing ? centsToInput(editing.balanceCents) : ""}
                placeholder="0,00"
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            {editing && (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                onClick={() =>
                  update.mutate({ id: editing.id, isArchived: true })
                }
              >
                Archivar
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

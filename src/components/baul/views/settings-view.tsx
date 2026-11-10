"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { api, type RouterOutputs } from "@/trpc/react";
import { KIND_LABEL, SCOPE_LABEL, relativeTime } from "../format";
import { PageHeader } from "../page-header";

type Category = RouterOutputs["finance"]["categories"]["list"][number];

const COLORS = [
  "#64748b",
  "#7c3aed",
  "#0891b2",
  "#b45309",
  "#65a30d",
  "#0f766e",
  "#db2777",
  "#dc2626",
  "#16a34a",
  "#a8a29e",
];

export function SettingsView() {
  const categories = api.finance.categories.list.useQuery();
  const connections = api.finance.connections.list.useQuery();
  const utils = api.useUtils();
  const refresh = () => utils.finance.invalidate();
  const create = api.finance.categories.create.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const removeConnection = api.finance.connections.remove.useMutation({
    onSuccess: async () => {
      toast.success("Conexión eliminada. Sus cuentas quedan como manuales.");
      await refresh();
    },
  });
  const [name, setName] = useState("");

  return (
    <>
      <PageHeader
        title="Ajustes."
        subtitle="A tu manera."
        description="Categorías y conexiones con tus bancos."
      />

      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-medium tracking-tight">Categorías</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          El ámbito decide si cuenta como personal o de trabajo. Las
          transferencias no cuentan como gasto.
        </p>
        <div className="bg-muted mt-4 overflow-hidden rounded-xl">
          <ul className="divide-background divide-y">
            {(categories.data ?? []).map((c) => (
              <CategoryRow key={c.id} category={c} onChange={refresh} />
            ))}
          </ul>
          <form
            className="border-background flex gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              create.mutate({
                name: name.trim(),
                kind: "expense",
                scope: "personal",
                color: COLORS[(categories.data?.length ?? 0) % COLORS.length],
              });
              setName("");
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Nueva categoría"
              className="bg-background h-9"
            />
            <Button
              type="submit"
              size="sm"
              className="h-9"
              disabled={create.isPending}
            >
              <Plus className="size-4" />
              Añadir
            </Button>
          </form>
        </div>
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-medium tracking-tight">
          Bancos conectados
        </h2>
        <div className="bg-muted mt-4 overflow-hidden rounded-xl">
          {connections.data?.length === 0 && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Ninguno. Conéctalos desde Cuentas.
            </p>
          )}
          <ul className="divide-background divide-y">
            {(connections.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex-1">
                  <p className="text-sm">{c.name}</p>
                  <p className="text-muted-foreground text-xs capitalize">
                    {c.provider} · sincronizado {relativeTime(c.lastSyncedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm(
                        `¿Desconectar ${c.name}? Se borra la API key; cuentas y movimientos se quedan.`,
                      )
                    ) {
                      removeConnection.mutate({ id: c.id });
                    }
                  }}
                >
                  Desconectar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

function CategoryRow({
  category: c,
  onChange,
}: {
  category: Category;
  onChange: () => unknown;
}) {
  const update = api.finance.categories.update.useMutation({
    onSuccess: onChange,
    onError: (e) => toast.error(e.message),
  });
  const remove = api.finance.categories.delete.useMutation({
    onSuccess: onChange,
  });
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:flex-nowrap sm:px-5">
      <label
        className="relative size-5 shrink-0 cursor-pointer rounded-full"
        style={{ background: c.color }}
      >
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          defaultValue={c.color}
          onBlur={(e) =>
            e.currentTarget.value !== c.color &&
            update.mutate({ id: c.id, color: e.currentTarget.value })
          }
          aria-label={`Color de ${c.name}`}
        />
      </label>
      <Input
        defaultValue={c.name}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-2 shadow-none"
        onBlur={(e) => {
          const value = e.currentTarget.value.trim();
          if (value && value !== c.name)
            update.mutate({ id: c.id, name: value });
        }}
      />
      <NativeSelect
        size="sm"
        value={c.scope}
        onChange={(e) =>
          update.mutate({
            id: c.id,
            scope: e.currentTarget.value as Category["scope"],
          })
        }
        aria-label="Ámbito"
      >
        {Object.entries(SCOPE_LABEL).map(([v, l]) => (
          <NativeSelectOption key={v} value={v}>
            {l}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        size="sm"
        value={c.kind}
        onChange={(e) =>
          update.mutate({
            id: c.id,
            kind: e.currentTarget.value as Category["kind"],
          })
        }
        aria-label="Tipo"
      >
        {Object.entries(KIND_LABEL).map(([v, l]) => (
          <NativeSelectOption key={v} value={v}>
            {l}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <button
        aria-label={`Eliminar ${c.name}`}
        className="text-muted-foreground hover:text-foreground p-1"
        onClick={() =>
          confirm(
            `¿Eliminar ${c.name}? Sus movimientos quedarán sin categoría.`,
          ) && remove.mutate({ id: c.id })
        }
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

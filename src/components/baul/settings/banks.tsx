"use client";

import Link from "next/link";
import { Landmark, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { relativeTime } from "../format";
import { PageHeader } from "../page-header";
import { SettingsSection } from "./settings-section";

export function BanksSettings() {
  const connections = api.finance.connections.list.useQuery();
  const utils = api.useUtils();
  const remove = api.finance.connections.remove.useMutation({
    onSuccess: async () => {
      toast.success("Banco desconectado. Sus cuentas quedan como manuales.");
      await utils.finance.invalidate();
    },
  });

  return (
    <>
      <PageHeader
        title="Bancos"
        actions={
          <Button asChild>
            <Link href="/conectar-banco">
              <Link2 className="size-4" />
              Conectar banco
            </Link>
          </Button>
        }
      />
      <div className="mt-9">
        <SettingsSection
          title="Conexiones"
          description="Tus bancos se sincronizan cada día. Las credenciales se guardan cifradas."
          bare
        >
          <ul className="bg-muted divide-background divide-y overflow-hidden rounded-xl">
            {connections.data?.length === 0 && (
              <li className="text-muted-foreground px-5 py-10 text-center text-sm">
                Ninguno todavía.
              </li>
            )}
            {(connections.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                <Landmark className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {c.name}{" "}
                    <span className="text-muted-foreground text-xs capitalize">
                      {c.provider}
                    </span>
                  </p>
                  <p
                    className={`truncate text-xs ${c.lastError ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}
                  >
                    Sincronizado {relativeTime(c.lastSyncedAt)}
                    {c.lastError && ` · ${c.lastError}`}
                  </p>
                </div>
                {c.provider === "enablebanking" && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/conectar-banco?method=bank">
                      Renovar permiso
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm(
                        `¿Desconectar ${c.name}? Se borra la API key; cuentas y movimientos se quedan.`,
                      )
                    ) {
                      remove.mutate({ id: c.id });
                    }
                  }}
                >
                  Desconectar
                </Button>
              </li>
            ))}
          </ul>
        </SettingsSection>
      </div>
    </>
  );
}

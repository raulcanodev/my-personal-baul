"use client";

import { Bot, Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { relativeTime } from "../format";
import { PageHeader } from "../page-header";
import { SettingsSection } from "./settings-section";

const SCOPE_LABEL: Record<string, string> = {
  "baul:read": "leer",
  "baul:write": "modificar",
};

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-background flex items-center gap-2 rounded-lg py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 truncate text-sm">{value}</code>
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

export function AgentsSettings() {
  const agents = api.account.agents.useQuery();
  const utils = api.useUtils();
  const disconnect = api.account.disconnectApp.useMutation({
    onSuccess: async () => {
      toast.success("App desconectada");
      await utils.account.agents.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const url = agents.data?.mcpUrl;

  return (
    <>
      <PageHeader title="Agentes (MCP)" />
      <div className="mt-9">
        <SettingsSection
          title="Conectar Baúl a un agente"
          description="Claude, ChatGPT o Claude Code pueden consultar tus finanzas y ayudarte a ordenarlas. Inicias sesión una vez y la conexión se mantiene sola."
        >
          {url ? (
            <CopyField value={url} />
          ) : (
            <Skeleton className="bg-background/60 h-11" />
          )}
          <ul className="text-muted-foreground mt-5 space-y-2 text-sm">
            <li>
              <span className="text-foreground">Claude</span> (web, escritorio y
              móvil): Ajustes → Conectores → Añadir conector personalizado →
              pega la URL.
            </li>
            <li>
              <span className="text-foreground">ChatGPT</span>: Ajustes →
              Conectores → Crear → pega la URL.
            </li>
            <li>
              <span className="text-foreground">Claude Code</span>:{" "}
              <code className="bg-background rounded px-1.5 py-0.5 text-xs">
                claude mcp add --transport http baul {url ?? "…"}
              </code>
            </li>
          </ul>
        </SettingsSection>

        <SettingsSection
          title="Apps conectadas"
          description="Desconectar una app le quita el acceso: tendrá que volver a pedirte permiso."
          bare
        >
          <ul className="bg-muted divide-background divide-y overflow-hidden rounded-xl">
            {agents.isLoading && (
              <li className="text-muted-foreground px-5 py-6 text-sm">
                Cargando…
              </li>
            )}
            {agents.data?.apps.length === 0 && (
              <li className="text-muted-foreground px-5 py-10 text-center text-sm">
                Ninguna todavía.
              </li>
            )}
            {agents.data?.apps.map((app) => (
              <li
                key={app.clientId}
                className="flex items-center gap-3 px-5 py-3.5"
              >
                <span className="bg-background flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Bot className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{app.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    Puede{" "}
                    {app.scopes
                      .map((s) => SCOPE_LABEL[s])
                      .filter(Boolean)
                      .join(" y ") || "acceder"}
                    {" · "}
                    {app.lastUsedAt
                      ? `último acceso ${relativeTime(app.lastUsedAt)}`
                      : app.active
                        ? "conectada"
                        : "sin acceso activo"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disconnect.isPending}
                  onClick={() => {
                    if (confirm(`¿Desconectar ${app.name}?`))
                      disconnect.mutate({ clientId: app.clientId });
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

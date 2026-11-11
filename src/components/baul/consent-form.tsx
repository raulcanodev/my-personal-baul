"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/server/better-auth/client";
import { Brand } from "./brand";

const SCOPE_LABELS: Record<string, string> = {
  "baul:read": "Ver tus cuentas, movimientos, categorías y suscripciones",
  "baul:write":
    "Categorizar movimientos, apuntar movimientos y gestionar suscripciones",
  offline_access: "Seguir conectado sin volver a pedirte acceso",
};

export function ConsentForm() {
  const params = useSearchParams();
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "")
    .split(" ")
    .filter((s) => SCOPE_LABELS[s]);
  const [clientName, setClientName] = useState<string>();
  const [pending, setPending] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId) return;
    void authClient
      .$fetch<{ client_name?: string }>("/oauth2/public-client", {
        query: { client_id: clientId },
      })
      .then((r) => setClientName(r.data?.client_name));
  }, [clientId]);

  async function answer(accept: boolean) {
    setError("");
    setPending(accept ? "accept" : "deny");
    const result = await authClient.oauth2.consent({ accept });
    if (result.data?.url) {
      window.location.href = result.data.url;
      return;
    }
    setPending(null);
    setError(result.error?.message ?? "No se pudo completar la autorización");
  }

  return (
    <main className="flex min-h-svh flex-col p-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:p-10">
      <Brand />
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-medium tracking-tight">
            {clientName ?? "Una aplicación"} quiere acceder a tu baúl
          </h1>
          <ul className="mt-8 space-y-3 text-sm">
            {scopes.map((s) => (
              <li key={s} className="bg-muted rounded-lg px-4 py-3">
                {SCOPE_LABELS[s]}
              </li>
            ))}
          </ul>
          {error && (
            <p className="mt-4 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              className="h-12"
              disabled={!!pending}
              onClick={() => void answer(false)}
            >
              {pending === "deny" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Cancelar"
              )}
            </Button>
            <Button
              className="h-12"
              disabled={!!pending}
              onClick={() => void answer(true)}
            >
              {pending === "accept" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Permitir"
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

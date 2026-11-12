"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";
import { formText } from "./format";

export function ConnectApiBank({ provider }: { provider: "wise" | "mercury" }) {
  const router = useRouter();
  const utils = api.useUtils();
  const name = provider === "wise" ? "Wise" : "Mercury";
  const add = api.finance.connections.add.useMutation({
    onSuccess: async (result) => {
      await utils.finance.invalidate();
      router.push(
        `/conectar-banco?result=${result.errors.length ? "partial" : "connected"}`,
      );
      router.refresh();
    },
  });
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        add.mutate({
          provider,
          name: formText(form, "name").trim(),
          apiKey: formText(form, "apiKey").trim(),
        });
      }}
    >
      <p className="text-muted-foreground text-sm">
        Crea un token de solo lectura en {name} → Settings → API Tokens y pégalo
        aquí.
      </p>
      {provider === "wise" && (
        <p className="bg-muted rounded-xl p-4 text-sm">
          En cuentas personales europeas, Wise permite consultar el saldo por
          API, pero no los movimientos.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="bank-name">Nombre de la conexión</Label>
        <Input
          id="bank-name"
          name="name"
          defaultValue={name}
          required
          maxLength={80}
          disabled={add.isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bank-key">Token de solo lectura</Label>
        <Input
          id="bank-key"
          name="apiKey"
          type="password"
          required
          minLength={8}
          autoComplete="off"
          disabled={add.isPending}
        />
      </div>
      {add.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {add.error.message}
        </p>
      )}
      <Button type="submit" className="h-12 w-full" disabled={add.isPending}>
        {add.isPending && <Loader2 className="size-4 animate-spin" />}
        {add.isPending ? "Conectando…" : `Conectar ${name}`}
      </Button>
    </form>
  );
}

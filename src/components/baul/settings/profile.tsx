"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/server/better-auth/client";
import { formText } from "../format";
import { PageHeader } from "../page-header";
import { SettingsSection } from "./settings-section";

export function ProfileSettings() {
  const { data, isPending, refetch } = authClient.useSession();
  const [saving, setSaving] = useState(false);
  const user = data?.user;

  return (
    <>
      <PageHeader title="Perfil" />
      <div className="mt-9">
        <SettingsSection
          title="Tus datos"
          description="Cómo te saluda Baúl y con qué usuario entras."
        >
          {isPending || !user ? (
            <Skeleton className="bg-background/60 h-40" />
          ) : (
            <form
              key={user.id}
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const name = formText(f, "name").trim();
                const username = formText(f, "username").trim();
                setSaving(true);
                const r = await authClient.updateUser({
                  name,
                  ...(username && username !== user.username
                    ? { username, displayUsername: username }
                    : {}),
                });
                setSaving(false);
                if (r.error)
                  toast.error(r.error.message ?? "No se pudo guardar");
                else {
                  toast.success("Perfil guardado");
                  await refetch();
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="p-name">Nombre</Label>
                <Input
                  id="p-name"
                  name="name"
                  defaultValue={user.name}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-username">Usuario</Label>
                <Input
                  id="p-username"
                  name="username"
                  defaultValue={user.displayUsername ?? user.username ?? ""}
                  autoCapitalize="none"
                  minLength={3}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="p-email">Email</Label>
                <Input id="p-email" value={user.email} readOnly disabled />
              </div>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="text-muted-foreground text-xs">
                  En Baúl desde{" "}
                  {new Intl.DateTimeFormat("es-ES", {
                    month: "long",
                    year: "numeric",
                  }).format(new Date(user.createdAt))}
                </p>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </form>
          )}
        </SettingsSection>
      </div>
    </>
  );
}

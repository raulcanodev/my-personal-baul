"use client";

import { ConfirmDialog } from "@/components/baul/confirm-dialog";
import { useState } from "react";
import { Laptop, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/server/better-auth/client";
import { formText, relativeTime } from "../format";
import { PageHeader } from "../page-header";
import { SettingsSection } from "./settings-section";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/** "Chrome · macOS" out of a user agent, enough to recognise a device */
const BROWSERS: [string, string][] = [
  ["Edg/", "Edge"],
  ["Brave", "Brave"],
  ["Chrome/", "Chrome"],
  ["Firefox/", "Firefox"],
  ["Safari/", "Safari"],
];
const SYSTEMS: [string, string][] = [
  ["iPhone", "iOS"],
  ["iPad", "iPadOS"],
  ["Android", "Android"],
  ["Mac OS X", "macOS"],
  ["Windows", "Windows"],
  ["Linux", "Linux"],
];

function describeDevice(ua: string | null | undefined) {
  if (!ua) return { label: "Dispositivo desconocido", mobile: false };
  if (/^(curl|python|node|undici)/i.test(ua))
    return { label: "Script o terminal", mobile: false };
  const browser = BROWSERS.find(([k]) => ua.includes(k))?.[1] ?? "Navegador";
  const os = SYSTEMS.find(([k]) => ua.includes(k))?.[1];
  const mobile = ["Mobile", "iPhone", "Android"].some((k) => ua.includes(k));
  return { label: os ? `${browser} · ${os}` : browser, mobile };
}

export function SecuritySettings() {
  return (
    <>
      <PageHeader title="Seguridad" />
      <div className="mt-9">
        <PasswordForm />
        <Sessions />
      </div>
    </>
  );
}

function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const queryClient = useQueryClient();
  return (
    <SettingsSection title="Contraseña" description="Al menos 8 caracteres.">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const next = formText(f, "next");
          if (next !== formText(f, "confirm")) {
            toast.error("Las contraseñas nuevas no coinciden");
            return;
          }
          setPending(true);
          const r = await authClient.changePassword({
            currentPassword: formText(f, "current"),
            newPassword: next,
            revokeOtherSessions: signOutOthers,
          });
          setPending(false);
          if (r.error) {
            toast.error(
              r.error.code === "INVALID_PASSWORD"
                ? "La contraseña actual no es correcta"
                : (r.error.message ?? "No se pudo cambiar"),
            );
            return;
          }
          form.reset();
          toast.success(
            signOutOthers
              ? "Contraseña cambiada. Las demás sesiones se han cerrado."
              : "Contraseña cambiada",
          );
          await queryClient.invalidateQueries({ queryKey: ["sessions"] });
        }}
      >
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pw-current">Contraseña actual</Label>
          <Input
            id="pw-current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-next">Nueva contraseña</Label>
          <Input
            id="pw-next"
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-confirm">Repítela</Label>
          <Input
            id="pw-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={signOutOthers}
              onCheckedChange={setSignOutOthers}
            />
            Cerrar las demás sesiones
          </label>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Cambiar contraseña
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

function Sessions() {
  const { data: current } = authClient.useSession();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const r = await authClient.listSessions();
      if (r.error) throw new Error(r.error.message);
      return [...r.data].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    },
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  const isCurrent = (token: string) => token === current?.session.token;
  // This device first, then the rest by last activity
  const list = [...(sessions.data ?? [])].sort(
    (a, b) => Number(isCurrent(b.token)) - Number(isCurrent(a.token)),
  );
  const others = list.filter((s) => !isCurrent(s.token));

  return (
    <SettingsSection
      title="Sesiones abiertas"
      description="Dispositivos donde tienes Baúl abierto."
      bare
      action={
        others.length > 0 && (
          <ConfirmDialog
            title="¿Cerrar las demás sesiones?"
            description="Tendrás que volver a iniciar sesión en esos dispositivos."
            confirmLabel="Cerrar sesiones"
            onConfirm={async () => {
              await authClient.revokeOtherSessions();
              toast.success("Las demás sesiones se han cerrado");
              await refresh();
            }}
          >
            <Button variant="secondary" size="sm">
              Cerrar las demás
            </Button>
          </ConfirmDialog>
        )
      }
    >
      <ul className="bg-muted divide-background divide-y overflow-hidden rounded-xl">
        {list.map((s) => {
          const device = describeDevice(s.userAgent);
          const thisDevice = isCurrent(s.token);
          const Icon = device.mobile ? Smartphone : Laptop;
          return (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3.5">
              <Icon className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {device.label}
                  {thisDevice && (
                    <span className="text-muted-foreground">
                      {" "}
                      · este dispositivo
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  Activa {relativeTime(s.updatedAt)}
                  {s.ipAddress && ` · ${s.ipAddress}`}
                </p>
              </div>
              {!thisDevice && (
                <ConfirmDialog
                  title="¿Cerrar esta sesión?"
                  description={`Se cerrará la sesión en ${device.label}.`}
                  confirmLabel="Cerrar sesión"
                  onConfirm={async () => {
                    await authClient.revokeSession({ token: s.token });
                    toast.success("Sesión cerrada");
                    await refresh();
                  }}
                >
                  <Button variant="ghost" size="sm">
                    Cerrar
                  </Button>
                </ConfirmDialog>
              )}
            </li>
          );
        })}
        {sessions.isLoading && (
          <li className="text-muted-foreground px-5 py-6 text-sm">Cargando…</li>
        )}
      </ul>
    </SettingsSection>
  );
}

"use client";

import { useState } from "react";
import { Check, Copy, Plus, Ticket, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { ConfirmDialog } from "../confirm-dialog";
import { relativeTime, shortDate } from "../format";
import { PageHeader, StatCard } from "../page-header";
import { SettingsSection } from "../settings/settings-section";

export function AdminView() {
  const users = api.admin.users.useQuery();
  const invites = api.admin.invites.list.useQuery();
  const available = invites.data?.filter((i) => !i.usedAt).length;

  return (
    <>
      <PageHeader title="Admin" />

      <div className="mt-9 grid gap-3 sm:grid-cols-2">
        {!users.data || !invites.data ? (
          Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              inverted
              label="Usuarios"
              value={String(users.data.length)}
              note={`${users.data.filter((u) => u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 30 * 86400000).length} activos en 30 días`}
              icon={<Users className="size-4" />}
            />
            <StatCard
              label="Invitaciones disponibles"
              value={String(available)}
              note={`${invites.data.length - available!} usadas`}
              icon={<Ticket className="size-4" />}
            />
          </>
        )}
      </div>

      <div className="mt-10 space-y-10">
        <Invites />
        <SettingsSection
          title="Usuarios registrados"
          description="Quién tiene cuenta en Baúl y cuándo entró por última vez."
          bare
        >
          <ul className="bg-muted divide-background divide-y overflow-hidden rounded-xl">
            {!users.data && (
              <li className="p-2">
                <Skeleton className="bg-background/70 h-12 rounded-lg" />
              </li>
            )}
            {users.data?.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="bg-background flex size-8 shrink-0 items-center justify-center rounded-lg text-xs">
                  {(u.username ?? u.name).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {u.username ?? u.name}
                    {u.role === "admin" && (
                      <span className="text-muted-foreground"> · admin</span>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {u.email}
                    {u.inviteNote && ` · invitación «${u.inviteNote}»`}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <p>Alta {shortDate(u.createdAt)}</p>
                  <p className="text-muted-foreground">
                    {u.lastSeenAt
                      ? `activo ${relativeTime(u.lastSeenAt)}`
                      : "sin sesiones"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SettingsSection>
      </div>
    </>
  );
}

function Invites() {
  const utils = api.useUtils();
  const invites = api.admin.invites.list.useQuery();
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const create = api.admin.invites.create.useMutation({
    onSuccess: async ({ code }) => {
      setNote("");
      await utils.admin.invalidate();
      await copy(code);
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = api.admin.invites.revoke.useMutation({
    onSuccess: () => utils.admin.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  async function copy(code: string) {
    const link = `${window.location.origin}/registro?codigo=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(code);
      toast.success("Enlace de invitación copiado");
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      toast.message(`Código: ${code}`);
    }
  }

  return (
    <SettingsSection
      title="Invitaciones"
      description="Para crear una cuenta hace falta un código. Cada código sirve una sola vez; al crearlo se copia el enlace de registro con el código ya puesto."
      bare
    >
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ note: note || undefined });
        }}
      >
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Para quién es (opcional)"
          maxLength={80}
          className="h-9"
        />
        <Button type="submit" disabled={create.isPending} className="h-9">
          <Plus className="size-4" />
          Generar código
        </Button>
      </form>
      <ul className="bg-muted divide-background divide-y overflow-hidden rounded-xl">
        {!invites.data && (
          <li className="p-2">
            <Skeleton className="bg-background/70 h-12 rounded-lg" />
          </li>
        )}
        {invites.data?.length === 0 && (
          <li className="text-muted-foreground px-5 py-8 text-center text-sm">
            Aún no has creado ninguna invitación.
          </li>
        )}
        {invites.data?.map((i) => (
          <li
            key={i.code}
            className={`flex items-center gap-3 px-5 py-3 ${i.usedAt ? "opacity-60" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm tracking-wide">{i.code}</p>
              <p className="text-muted-foreground truncate text-xs">
                {i.note ? `${i.note} · ` : ""}
                {i.usedAt
                  ? `usada por ${i.usedBy ?? "una cuenta borrada"} ${relativeTime(i.usedAt)}`
                  : `creada ${relativeTime(i.createdAt)}`}
              </p>
            </div>
            {!i.usedAt && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copiar enlace de invitación"
                  onClick={() => void copy(i.code)}
                >
                  {copied === i.code ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
                <ConfirmDialog
                  title="¿Revocar esta invitación?"
                  description={`El código ${i.code} dejará de servir para crear una cuenta.`}
                  confirmLabel="Revocar"
                  onConfirm={() => revoke.mutate({ code: i.code })}
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Revocar invitación"
                    disabled={revoke.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </ConfirmDialog>
              </>
            )}
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}

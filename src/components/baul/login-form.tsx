"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/server/better-auth/client";
import type { SignupStatus } from "@/server/better-auth/signup";
import { Brand } from "./brand";
import { formText } from "./format";

type Mode = "login" | "register";

export function AuthForm({
  mode,
  signup,
  inviteCode,
}: {
  mode: Mode;
  signup: SignupStatus;
  inviteCode?: string;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const register = mode === "register";

  async function submit(form: FormData) {
    setError("");
    setPending(true);
    const username = formText(form, "username").trim();
    const password = formText(form, "password");
    try {
      const result = register
        ? await authClient.signUp.email(
            {
              username,
              name: username,
              email: formText(form, "email").trim(),
              password,
            },
            { headers: { "x-invite-code": formText(form, "code") } },
          )
        : await authClient.signIn.username({ username, password });
      if (result.error) {
        setError(
          register
            ? (result.error.message ?? "No se pudo crear la cuenta")
            : "Usuario o contraseña incorrectos",
        );
        return;
      }
      // Signing in for an MCP client (Claude…): continue its OAuth flow instead of the app
      const next = result.data as { redirect?: boolean; url?: string } | null;
      if (next?.redirect && next.url) {
        window.location.href = next.url;
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo conectar");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-col p-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:p-10">
      <Brand />
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="w-full max-w-xs">
          <h1 className="text-3xl font-medium tracking-tight">
            {register ? "Crear cuenta." : "Entrar."}
          </h1>
          <form
            className="mt-8 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(new FormData(e.currentTarget));
            }}
          >
            <Input
              name="username"
              aria-label="Usuario"
              placeholder="Usuario"
              autoComplete="username"
              autoCapitalize="none"
              required
              minLength={register ? 3 : undefined}
              className="h-12"
            />
            {register && (
              <Input
                name="email"
                type="email"
                aria-label="Email"
                placeholder="Email"
                autoComplete="email"
                required
                className="h-12"
              />
            )}
            <div className="relative">
              <Input
                name="password"
                type={visible ? "text" : "password"}
                aria-label="Contraseña"
                placeholder="Contraseña"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={register ? 8 : undefined}
                className="h-12 pr-12"
              />
              <button
                type="button"
                aria-label={
                  visible ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                onClick={() => setVisible(!visible)}
                className="text-muted-foreground absolute top-4 right-4"
              >
                {visible ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {register && signup === "invite" && (
              <Input
                name="code"
                aria-label="Código de invitación"
                placeholder="Código de invitación"
                autoComplete="off"
                autoCapitalize="characters"
                defaultValue={inviteCode}
                required
                className="h-12"
              />
            )}
            {error && (
              <p
                role="alert"
                className="text-sm text-red-700 dark:text-red-400"
              >
                {error}
              </p>
            )}
            <Button disabled={pending} className="h-12 w-full" type="submit">
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  {register ? "Crear cuenta" : "Entrar"}
                  <ArrowRight className="ml-auto size-4" />
                </>
              )}
            </Button>
          </form>
          {register ? (
            signup !== "open" && (
              <Link
                href="/login"
                className="text-muted-foreground mt-6 block text-center text-sm"
              >
                Ya tengo cuenta
              </Link>
            )
          ) : (
            <Link
              href="/registro"
              className="text-muted-foreground mt-6 block text-center text-sm"
            >
              Crear cuenta
            </Link>
          )}
        </div>
      </div>
      <footer className="text-muted-foreground flex justify-center gap-6 text-sm">
        <Link href="/privacidad" className="underline underline-offset-4">
          Privacidad
        </Link>
        <Link href="/terminos" className="underline underline-offset-4">
          Términos de uso
        </Link>
      </footer>
    </main>
  );
}

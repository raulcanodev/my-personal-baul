"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/server/better-auth/client";
import { Brand } from "./brand";

export function LoginForm() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="flex min-h-svh flex-col p-6 sm:p-10">
      <header>
        <Brand />
      </header>
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="w-full max-w-sm">
          <h1 className="text-4xl leading-tight font-medium tracking-tight">
            Tu espacio.
            <br />
            <span className="text-muted-foreground">Todo en su sitio.</span>
          </h1>
          <p className="text-muted-foreground mt-5 text-sm">
            Un lugar tranquilo para tus números y tus cosas.
          </p>
          <form
            className="mt-10 space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              setPending(true);
              const data = new FormData(event.currentTarget);
              try {
                const result = await authClient.signIn.username({
                  username: data.get("username") as string,
                  password: data.get("password") as string,
                });
                if (result.error) setError("Usuario o contraseña incorrectos.");
                else {
                  router.replace("/dashboard");
                  router.refresh();
                }
              } catch {
                setError("No se pudo conectar. Inténtalo de nuevo más tarde.");
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="Tu nombre de usuario"
                required
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  required
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
            </div>
            {error && (
              <p role="alert" className="text-sm">
                {error}
              </p>
            )}
            <Button disabled={pending} className="h-12 w-full" type="submit">
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Entrar en mi baúl
                  <ArrowRight className="ml-auto size-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
      <footer className="text-muted-foreground flex justify-between text-xs">
        <span>Menos ruido. Más claridad.</span>
        <span>Un espacio personal.</span>
      </footer>
    </main>
  );
}

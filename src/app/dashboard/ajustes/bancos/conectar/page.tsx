import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Landmark,
  KeyRound,
  CircleAlert,
} from "lucide-react";
import { ConnectApiBank } from "@/components/baul/connect-api-bank";
import { requireSession } from "@/server/better-auth/server";
import {
  enableConfiguration,
  listEnableBanks,
} from "@/server/finance/enablebanking";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/baul/page-header";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const credentials = enableConfiguration(session.user.id);
  const params = await searchParams;
  const result = typeof params.result === "string" ? params.result : "";
  if (result === "connected" || result === "partial") {
    const partial = result === "partial";
    return (
      <>
        <PageHeader
          title={
            partial
              ? "Banco conectado, con avisos"
              : "Tu banco ya está conectado"
          }
        />
        <div className="mt-8 max-w-lg rounded-2xl border p-6 sm:p-8">
          <div className="bg-muted mb-5 flex size-12 items-center justify-center rounded-full">
            {partial ? (
              <CircleAlert className="size-6" />
            ) : (
              <Check className="size-6" />
            )}
          </div>
          <p role="status" className="text-muted-foreground leading-relaxed">
            {partial
              ? "La autorización se ha guardado, pero no se han podido sincronizar todos los datos. Revisa el aviso de la conexión en tus cuentas y vuelve a sincronizar desde allí. No necesitas autorizar de nuevo ahora."
              : "La sincronización ha terminado. Tus saldos y movimientos ya están disponibles y se actualizarán cada día. No tienes que volver a autorizar."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard/cuentas">
                Ver mis cuentas
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/ajustes/bancos/conectar">
                Conectar otro banco
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }
  const method =
    params.method === "wise" ||
    params.method === "mercury" ||
    params.method === "bank"
      ? params.method
      : result || params.error
        ? "bank"
        : null;
  if (!method)
    return (
      <>
        <PageHeader title="Conectar banco" />
        <div className="mt-8 max-w-xl space-y-3">
          <p className="text-muted-foreground mb-6 text-sm">
            Elige cómo quieres conectar tu cuenta. Solo consultaremos saldos y
            movimientos.
          </p>
          {credentials && (
            <Link
              href="/dashboard/ajustes/bancos/conectar?method=bank"
              className="bg-muted hover:bg-muted/70 flex items-center gap-4 rounded-xl border p-5 transition-colors"
            >
              <Landmark className="size-6 shrink-0" />
              <div className="flex-1">
                <h2 className="font-medium">Revolut y otros bancos</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Busca tu banco por país y autoriza el acceso en su web o app.
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          )}
          {(["wise", "mercury"] as const).map((provider) => (
            <Link
              key={provider}
              href={`/dashboard/ajustes/bancos/conectar?method=${provider}`}
              className="hover:bg-muted flex items-center gap-4 rounded-xl border p-5 transition-colors"
            >
              <KeyRound className="text-muted-foreground size-5 shrink-0" />
              <div className="flex-1">
                <h2 className="font-medium">
                  {provider === "wise" ? "Wise" : "Mercury"}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Conecta con un token de solo lectura.
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          ))}
          <Link
            href="/dashboard/ajustes/bancos"
            className="text-muted-foreground inline-flex items-center gap-2 pt-5 text-sm"
          >
            <ArrowLeft className="size-4" />
            Volver a bancos
          </Link>
        </div>
      </>
    );
  if (method === "wise" || method === "mercury")
    return (
      <>
        <PageHeader
          title={`Conectar ${method === "wise" ? "Wise" : "Mercury"}`}
        />
        <div className="mt-8 max-w-lg space-y-6">
          <Link
            href="/dashboard/ajustes/bancos/conectar"
            className="text-muted-foreground inline-flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="size-4" />
            Elegir otro banco
          </Link>
          <ConnectApiBank key={method} provider={method} />
        </div>
      </>
    );
  const country =
    typeof params.country === "string" && /^[A-Z]{2}$/.test(params.country)
      ? params.country
      : "PT";
  let banks: Awaited<ReturnType<typeof listEnableBanks>> = [];
  let failed = false;
  if (credentials) {
    try {
      banks = await listEnableBanks(credentials, country);
    } catch (error) {
      console.error(
        "Enable Banking catalog:",
        error instanceof Error ? error.message : "Unknown error",
      );
      failed = true;
    }
  }
  const messages: Record<string, string> = {
    connected:
      "Banco conectado y sincronizado. Ya puedes consultar tus cuentas y movimientos.",
    partial:
      "Banco conectado. La sincronización tiene avisos: revisa tus cuentas y vuelve a sincronizar.",
    invalid:
      "No se ha completado la autorización. Puede haber caducado o haberse cancelado. Iníciala de nuevo.",
    login:
      "La sesión de Baúl caducó durante la autorización. Inicia la conexión de nuevo.",
    forbidden: "Esta cuenta de Baúl no tiene habilitada esta integración.",
  };
  return (
    <>
      <PageHeader title="Conectar tu banco" />
      <div className="mt-8 max-w-lg space-y-6">
        {messages[result] && (
          <p role="status" className="bg-muted rounded-xl p-4 text-sm">
            {messages[result]}{" "}
            <Link href="/dashboard/cuentas" className="underline">
              Ver cuentas
            </Link>
          </p>
        )}
        {params.error && (
          <p role="alert">
            No se pudo iniciar la conexión. Comprueba el banco y vuelve a
            intentarlo.
          </p>
        )}
        {!credentials ? (
          <p>Enable Banking no está habilitado para esta cuenta de Baúl.</p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Elige el país y el banco de tus cuentas. Te llevaremos a su web o
              app para autorizar la conexión de forma segura mediante Enable
              Banking.
            </p>
            <form className="flex items-end gap-3" method="get">
              <input type="hidden" name="method" value="bank" />
              <label className="flex-1 space-y-2 text-sm">
                País del banco
                <select
                  name="country"
                  defaultValue={country}
                  className="bg-background mt-2 block h-11 w-full rounded-md border px-3"
                >
                  <option value="PT">Portugal</option>
                  <option value="ES">España</option>
                  <option value="LT">Lituania</option>
                  <option value="DE">Alemania</option>
                  <option value="FR">Francia</option>
                  <option value="IE">Irlanda</option>
                  <option value="GB">Reino Unido</option>
                  <option value="IT">Italia</option>
                  <option value="NL">Países Bajos</option>
                </select>
              </label>
              <Button type="submit" variant="secondary">
                Ver bancos
              </Button>
            </form>
            {failed ? (
              <p role="alert">
                No se pudo cargar el catálogo. Vuelve a intentarlo más tarde.
              </p>
            ) : (
              <form
                action="/api/banking/enablebanking/start"
                method="post"
                className="space-y-4"
              >
                <input type="hidden" name="country" value={country} />
                <label className="block text-sm">
                  Banco
                  <select
                    name="bank"
                    required
                    defaultValue={
                      banks.some((b) => b.name === "Revolut") ? "Revolut" : ""
                    }
                    className="bg-background mt-2 block h-11 w-full rounded-md border px-3"
                  >
                    <option value="" disabled>
                      Selecciona un banco
                    </option>
                    {banks.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-muted-foreground text-sm">
                  Te llevaremos a Enable Banking y a tu banco para que elijas
                  las cuentas y autorices el acceso. Si ya conectaste este
                  banco, se renovará su permiso conservando el historial.
                </p>
                <Button type="submit" disabled={!banks.length}>
                  Autorizar en el banco
                </Button>
              </form>
            )}
          </>
        )}
        <Link
          href="/dashboard/ajustes/bancos/conectar"
          className="block text-sm underline"
        >
          Elegir otro banco
        </Link>
      </div>
    </>
  );
}

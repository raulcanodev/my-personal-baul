import Link from "next/link";
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
  const country =
    typeof params.country === "string" && /^[A-Z]{2}$/.test(params.country)
      ? params.country
      : "PT";
  let banks: Awaited<ReturnType<typeof listEnableBanks>> = [];
  let failed = false;
  if (credentials) {
    try {
      banks = await listEnableBanks(credentials, country);
    } catch {
      failed = true;
    }
  }
  const result = typeof params.result === "string" ? params.result : "";
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
      <PageHeader title="Conectar otros bancos" />
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
              Conecta tus cuentas mediante Enable Banking para consultar saldos
              y movimientos confirmados. No se realizan pagos. Esta integración
              está restringida a las cuentas propias vinculadas en tu panel de
              Enable Banking.
            </p>
            <form className="flex items-end gap-3" method="get">
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
          href="/dashboard/ajustes/bancos"
          className="block text-sm underline"
        >
          Volver a bancos
        </Link>
      </div>
    </>
  );
}

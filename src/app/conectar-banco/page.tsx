import Link from "next/link";
import { X } from "lucide-react";
import { Brand } from "@/components/baul/brand";
import { BankConnectionPage } from "@/components/baul/bank-connection-page";
import { requireSession } from "@/server/better-auth/server";
import {
  enableConfiguration,
  listEnableBanks,
} from "@/server/finance/enablebanking";

export const metadata = { title: "Conectar banco · Baúl" };

export default async function ConnectBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const result = typeof params.result === "string" ? params.result : "";
  const country =
    typeof params.country === "string" && /^[A-Z]{2}$/.test(params.country)
      ? params.country
      : "PT";
  const credentials = enableConfiguration(session.user.id);
  let banks: { name: string; country: string }[] = [];
  let failed = false;
  if (credentials && result !== "connected" && result !== "partial") {
    try {
      banks = (await listEnableBanks(credentials, country)).map(
        ({ name, country }) => ({ name, country }),
      );
    } catch {
      failed = true;
    }
  }
  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col px-6 py-6 sm:px-10 sm:py-8">
      <header className="flex items-center justify-between">
        <Link href="/dashboard/cuentas" aria-label="Baúl, volver a cuentas">
          <Brand />
        </Link>
        <Link
          href="/dashboard/cuentas"
          aria-label="Cerrar y volver a cuentas"
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-10 items-center justify-center rounded-full transition-colors"
        >
          <X className="size-5" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 py-12 sm:py-16">
        <BankConnectionPage
          key={`${country}:${result}`}
          country={country}
          banks={banks}
          enabled={!!credentials}
          failed={failed}
          result={result}
          startError={!!params.error}
          initialMethod={
            params.method === "wise" || params.method === "mercury"
              ? params.method
              : undefined
          }
        />
      </main>
      <footer className="text-muted-foreground flex justify-center gap-5 pb-2 text-xs">
        <Link href="/privacidad">Privacidad</Link>
        <Link href="/terminos">Términos</Link>
      </footer>
    </div>
  );
}

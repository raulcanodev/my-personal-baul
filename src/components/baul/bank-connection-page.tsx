"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Loader2,
  LockKeyhole,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectApiBank } from "./connect-api-bank";

type Choice = { name: string; country?: string; provider?: "wise" | "mercury" };
const countries = [
  ["PT", "Portugal"],
  ["ES", "España"],
  ["LT", "Lituania"],
  ["DE", "Alemania"],
  ["FR", "Francia"],
  ["IE", "Irlanda"],
  ["GB", "Reino Unido"],
  ["IT", "Italia"],
  ["NL", "Países Bajos"],
];
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const favorites = [
  "Revolut",
  "BBVA",
  "Santander",
  "CaixaBank",
  "Ibercaja",
  "N26",
];

function BankMark({ name }: { name: string }) {
  const colors =
    name === "Wise"
      ? "bg-[#d7f7a8] text-[#243d1b]"
      : name === "Revolut"
        ? "bg-[#1b1b1b] text-white"
        : name === "Mercury"
          ? "bg-[#e7e3f2] text-[#51466e]"
          : "bg-muted text-foreground";
  return (
    <span
      aria-hidden="true"
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold ${colors}`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function BankConnectionPage({
  country,
  banks,
  enabled,
  failed,
  result,
  startError,
  initialMethod,
}: {
  country: string;
  banks: { name: string; country: string }[];
  enabled: boolean;
  failed: boolean;
  result: string;
  startError: boolean;
  initialMethod?: "wise" | "mercury";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Choice | null>(
    initialMethod
      ? {
          name: initialMethod === "wise" ? "Wise" : "Mercury",
          provider: initialMethod,
        }
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const complete = result === "connected" || result === "partial";
  const partial = result === "partial";
  const errors: Record<string, string> = {
    invalid: "La autorización no se completó. Puedes intentarlo de nuevo.",
    login: "Tu sesión caducó. Inicia la conexión de nuevo.",
    forbidden: "La conexión bancaria no está habilitada para esta cuenta.",
  };
  const choices: Choice[] = [...banks].sort((a, b) => {
    const rank = (name: string) => {
      const index = favorites.indexOf(name);
      return index < 0 ? favorites.length : index;
    };
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  });
  choices.splice(
    Math.min(choices.length, 1),
    0,
    { name: "Wise", provider: "wise" },
    { name: "Mercury", provider: "mercury" },
  );
  const filtered = choices.filter((bank) =>
    normalize(bank.name).includes(normalize(search.trim())),
  );

  if (complete)
    return (
      <div className="py-8">
        <div className="bg-muted mb-8 flex size-14 items-center justify-center rounded-full">
          {partial ? (
            <CircleAlert className="size-6" />
          ) : (
            <Check className="size-6" />
          )}
        </div>
        <p className="text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase">
          {partial ? "Conectado con avisos" : "Todo listo"}
        </p>
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
          Tu banco, en Baúl.
        </h1>
        <p
          role="status"
          className="text-muted-foreground mt-5 max-w-sm leading-relaxed"
        >
          {partial
            ? "La conexión está guardada. Revisa los avisos de sincronización en tus cuentas; no necesitas conectarla otra vez."
            : "Tus cuentas ya están sincronizadas. A partir de ahora se actualizarán cada día."}
        </p>
        <Button asChild className="mt-9 h-12 w-full">
          <Link href="/dashboard/cuentas">
            Ver mis cuentas
            <ArrowRight className="ml-auto size-4" />
          </Link>
        </Button>
        <Link
          href="/conectar-banco"
          className="text-muted-foreground hover:text-foreground mt-5 block text-center text-sm"
        >
          Conectar otro banco
        </Link>
      </div>
    );

  if (selected)
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          disabled={submitting}
          className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="size-4" />
          Cambiar de banco
        </button>
        <BankMark name={selected.name} />
        <h1 className="mt-5 text-3xl font-medium tracking-tight sm:text-4xl">
          Conecta {selected.name}.
        </h1>
        <div className="mt-7">
          {selected.provider ? (
            <ConnectApiBank
              key={selected.provider}
              provider={selected.provider}
            />
          ) : (
            <form
              action="/api/banking/enablebanking/start"
              method="post"
              onSubmit={() => setSubmitting(true)}
            >
              <input type="hidden" name="country" value={selected.country} />
              <input type="hidden" name="bank" value={selected.name} />
              <p className="text-muted-foreground leading-relaxed">
                Elige las cuentas que quieres compartir en la web o app de tu
                banco. Después volverás aquí.
              </p>
              <div className="mt-8 space-y-3 text-sm">
                <p className="flex items-center gap-3">
                  <Check className="text-muted-foreground size-4" />
                  Solo saldos y movimientos
                </p>
                <p className="flex items-center gap-3">
                  <Check className="text-muted-foreground size-4" />
                  Sin permisos para hacer pagos
                </p>
              </div>
              <Button
                className="mt-9 h-12 w-full"
                type="submit"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Abriendo tu banco…
                  </>
                ) : (
                  <>
                    Continuar al banco
                    <ArrowRight className="ml-auto size-4" />
                  </>
                )}
              </Button>
              <p className="text-muted-foreground mt-4 text-center text-xs">
                Conexión segura mediante Enable Banking
              </p>
            </form>
          )}
        </div>
      </div>
    );

  return (
    <>
      <p className="text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase">
        Tus cuentas, juntas
      </p>
      <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
        Conecta tu banco.
      </h1>
      <p className="text-muted-foreground mt-4 text-base">
        Saldos y movimientos, en un solo lugar.
      </p>
      {(errors[result] !== undefined || startError) && (
        <p role="alert" className="bg-muted mt-6 rounded-xl p-4 text-sm">
          {errors[result] ??
            "No pudimos abrir la conexión. Selecciona tu banco e inténtalo de nuevo."}
        </p>
      )}
      <div className="mt-9 flex items-center gap-3 border-b pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Search className="text-muted-foreground size-5 shrink-0" />
          <input
            autoComplete="off"
            aria-label="Buscar banco"
            placeholder="Busca tu banco"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={pending}
            className="placeholder:text-muted-foreground focus-visible:ring-ring w-full min-w-0 bg-transparent py-2 text-base outline-none focus-visible:ring-2"
          />
        </div>
        {enabled && (
          <div className="relative shrink-0">
            <select
              aria-label="País del banco"
              value={country}
              disabled={pending}
              onChange={(event) => {
                const next = event.target.value;
                setSelected(null);
                startTransition(() =>
                  router.replace(`/conectar-banco?country=${next}`, {
                    scroll: false,
                  }),
                );
              }}
              className="bg-muted focus-visible:ring-ring max-w-36 appearance-none rounded-full py-2 pr-8 pl-3 text-sm outline-none focus-visible:ring-2"
            >
              {!countries.some(([code]) => code === country) && (
                <option value={country}>{country}</option>
              )}
              {countries.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown className="text-muted-foreground pointer-events-none absolute top-2.5 right-3 size-4" />
          </div>
        )}
      </div>
      <div aria-busy={pending} className="mt-2">
        {pending ? (
          <div
            role="status"
            className="text-muted-foreground flex h-72 items-center justify-center gap-3 text-sm"
          >
            <Loader2 className="size-4 animate-spin" />
            Buscando bancos…
          </div>
        ) : (
          <>
            {failed && (
              <div role="alert" className="text-muted-foreground py-4 text-sm">
                No se han podido cargar los bancos de este país.{" "}
                <button
                  className="underline"
                  onClick={() => startTransition(() => router.refresh())}
                >
                  Reintentar
                </button>
              </div>
            )}
            <div className="max-h-[360px] overflow-y-auto overscroll-contain pr-1">
              {filtered.map((bank) => (
                <button
                  key={`${bank.provider ?? bank.country}:${bank.name}`}
                  type="button"
                  onClick={() => setSelected(bank)}
                  className="hover:bg-muted focus-visible:bg-muted group focus-visible:ring-ring flex w-full items-center gap-4 rounded-xl px-3 py-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <BankMark name={bank.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {bank.name}
                    </span>
                    {bank.provider && (
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        Con token de solo lectura
                      </span>
                    )}
                  </span>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
              {!filtered.length && (
                <p
                  role="status"
                  className="text-muted-foreground px-3 py-12 text-center text-sm"
                >
                  No encontramos ese banco. Prueba otro nombre o país.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <p className="text-muted-foreground mt-7 flex items-center justify-center gap-2 text-xs">
        <LockKeyhole className="size-3.5" />
        Solo lectura. Tú controlas el acceso.
      </p>
    </>
  );
}

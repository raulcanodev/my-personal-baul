import Link from "next/link";
import { Brand } from "@/components/baul/brand";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" aria-label="Baúl, inicio">
          <Brand />
        </Link>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Entrar
        </Link>
      </header>
      <main className="my-12 space-y-7 text-base leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_h1]:text-4xl [&_h1]:font-medium [&_h1]:tracking-tight [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-medium [&_li]:mb-2 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </main>
      <footer className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-3 border-t pt-6 text-sm">
        <Link href="/privacidad">Privacidad</Link>
        <Link href="/terminos">Términos de uso</Link>
        <a href="mailto:raul@zenex.dev">raul@zenex.dev</a>
      </footer>
    </div>
  );
}

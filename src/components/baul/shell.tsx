"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  LayoutGrid,
  LogOut,
  Repeat,
  Settings2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/server/better-auth/client";
import { Brand } from "./brand";
import { HeaderControls } from "./header-controls";

const navigation: { name: string; href: string; icon: LucideIcon }[] = [
  { name: "Resumen", href: "/dashboard", icon: LayoutGrid },
  { name: "Movimientos", href: "/dashboard/movimientos", icon: ArrowLeftRight },
  { name: "Suscripciones", href: "/dashboard/suscripciones", icon: Repeat },
  { name: "Cuentas", href: "/dashboard/cuentas", icon: Wallet },
];

const isActive = (pathname: string, href: string) =>
  href === "/dashboard" ? pathname === href : pathname.startsWith(href);

export function AppShell({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const current =
    [...navigation, { name: "Ajustes", href: "/dashboard/ajustes" }].find((n) =>
      isActive(pathname, n.href),
    )?.name ?? "Resumen";
  const initials = userName.slice(0, 2).toUpperCase();
  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-svh lg:pl-60">
      <aside className="bg-background fixed inset-y-0 left-0 z-40 hidden w-60 flex-col px-5 py-8 lg:flex">
        <div className="px-3">
          <Brand />
        </div>
        <p className="text-muted-foreground mt-14 px-3 text-xs">Mi espacio</p>
        <nav aria-label="Navegación principal" className="mt-4 space-y-1">
          {navigation.map(({ name, href, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors ${active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
              >
                <Icon className="size-4" strokeWidth={1.5} />
                {name}
                {active && (
                  <span className="bg-foreground ml-auto size-1 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-5 pt-16">
          <Link
            href="/dashboard/ajustes"
            className={`flex items-center gap-3 px-3 text-sm ${isActive(pathname, "/dashboard/ajustes") ? "text-foreground" : "text-muted-foreground"}`}
          >
            <Settings2 className="size-4" />
            Ajustes
          </Link>
          <div className="flex items-center gap-3 px-3 pt-3">
            <span className="bg-muted flex size-8 items-center justify-center rounded-lg text-xs">
              {initials}
            </span>
            <div className="flex-1">
              <p className="text-sm">{userName}</p>
              <p className="text-muted-foreground text-xs">Espacio personal</p>
            </div>
            <button aria-label="Cerrar sesión" onClick={signOut}>
              <LogOut className="text-muted-foreground size-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="mx-auto max-w-[1440px] px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-10 lg:px-12 lg:py-8">
        <header className="mb-10 flex items-center justify-between gap-4 text-sm lg:mb-12">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            <span className="text-muted-foreground">Mi espacio</span>
            <span className="text-muted-foreground/50">/</span>
            <span>{current}</span>
          </div>
          <div className="flex items-center gap-1">
            <HeaderControls />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Tu cuenta"
                className="bg-muted flex size-9 items-center justify-center rounded-full text-xs lg:hidden"
              >
                {initials}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm">{userName}</p>
                  <p className="text-muted-foreground text-xs">
                    Espacio personal
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/ajustes">
                    <Settings2 className="size-4" />
                    Ajustes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut className="size-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {children}
      </main>
      <nav
        aria-label="Navegación"
        className="bg-background/90 border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {navigation.map(({ name, href, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-muted" : ""}`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.5} />
                </span>
                {name}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

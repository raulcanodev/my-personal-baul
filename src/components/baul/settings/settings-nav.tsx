"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Database,
  Landmark,
  Palette,
  ShieldCheck,
  Tag,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type SettingsItem = { name: string; href: string; icon: LucideIcon };

// Like papra: account first, then the app's data, then what agents use
export const SETTINGS_SECTIONS: { label?: string; items: SettingsItem[] }[] = [
  {
    items: [
      { name: "Perfil", href: "/dashboard/ajustes", icon: UserRound },
      {
        name: "Seguridad",
        href: "/dashboard/ajustes/seguridad",
        icon: ShieldCheck,
      },
      {
        name: "Apariencia",
        href: "/dashboard/ajustes/apariencia",
        icon: Palette,
      },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { name: "Categorías", href: "/dashboard/ajustes/categorias", icon: Tag },
      { name: "Bancos", href: "/dashboard/ajustes/bancos", icon: Landmark },
    ],
  },
  {
    label: "Agentes y datos",
    items: [
      { name: "Agentes (MCP)", href: "/dashboard/ajustes/agentes", icon: Bot },
      {
        name: "Exportar datos",
        href: "/dashboard/ajustes/datos",
        icon: Database,
      },
    ],
  },
];

export const SETTINGS_ITEMS = SETTINGS_SECTIONS.flatMap((s) => s.items);

export const isSettingsPath = (pathname: string) =>
  pathname.startsWith("/dashboard/ajustes");

export function activeSettingsItem(pathname: string) {
  // Longest match wins: /dashboard/ajustes is the prefix of every section
  return [...SETTINGS_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}

/** Phones: the settings menu as a row of tabs above the content */
export function SettingsTabs() {
  const pathname = usePathname();
  const active = activeSettingsItem(pathname);
  return (
    <nav
      aria-label="Ajustes"
      className="-mx-5 mb-8 flex [scrollbar-width:none] gap-2 overflow-x-auto px-5 pb-1 sm:-mx-10 sm:px-10 lg:hidden"
    >
      {SETTINGS_ITEMS.map(({ name, href, icon: Icon }) => {
        const current = active?.href === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors ${current ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
          >
            <Icon className="size-3.5" />
            {name}
          </Link>
        );
      })}
    </nav>
  );
}

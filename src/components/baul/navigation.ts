import {
  ArrowLeftRight,
  CalendarClock,
  CalendarRange,
  CreditCard,
  House,
  LayoutGrid,
  Repeat,
  Settings2,
  Target,
  Wallet,
  ChartPie,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = { name: string; href: string; icon: LucideIcon };
export const mainNavigation: NavigationItem[] = [
  { name: "Inicio", href: "/dashboard", icon: House },
  { name: "Movimientos", href: "/dashboard/movimientos", icon: ArrowLeftRight },
  { name: "Cuentas", href: "/dashboard/cuentas", icon: Wallet },
];
export const moreNavigation: { label: string; items: NavigationItem[] }[] = [
  {
    label: "Planificación",
    items: [
      { name: "Previsión", href: "/dashboard/prevision", icon: CalendarRange },
      { name: "Deudas", href: "/dashboard/deudas", icon: CreditCard },
      { name: "Objetivos", href: "/dashboard/objetivos", icon: Target },
      { name: "Presupuestos", href: "/dashboard/presupuestos", icon: ChartPie },
    ],
  },
  {
    label: "Pagos y cobros",
    items: [
      { name: "Suscripciones", href: "/dashboard/suscripciones", icon: Repeat },
      {
        name: "Flujos previstos",
        href: "/dashboard/flujos",
        icon: CalendarClock,
      },
    ],
  },
  {
    label: "Configuración",
    items: [{ name: "Ajustes", href: "/dashboard/ajustes", icon: Settings2 }],
  },
];
export const mobileNavigation: NavigationItem[] = [
  ...mainNavigation,
  { name: "Más", href: "/dashboard/mas", icon: LayoutGrid },
];
export const navigation = [
  ...mainNavigation,
  ...moreNavigation.flatMap((g) => g.items),
  mobileNavigation[3]!,
];
export const isNavigationActive = (pathname: string, href: string) =>
  href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
export const isMorePath = (pathname: string) =>
  isNavigationActive(pathname, "/dashboard/mas") ||
  moreNavigation.some((g) =>
    g.items.some((item) => isNavigationActive(pathname, item.href)),
  );

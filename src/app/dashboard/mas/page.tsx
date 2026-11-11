import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { moreNavigation } from "@/components/baul/navigation";
import { PageHeader } from "@/components/baul/page-header";

export default function MorePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Más" />
      <nav aria-label="Más opciones" className="mt-8 space-y-8">
        {moreNavigation.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
              {group.label}
            </h2>
            <ul className="divide-border border-border divide-y border-y">
              {group.items.map(({ name, href, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="hover:bg-muted/60 focus-visible:ring-ring flex min-h-16 items-center gap-3 rounded-md px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-4" strokeWidth={1.5} />
                    </span>
                    <span className="flex-1 text-sm font-medium">{name}</span>
                    <ChevronRight className="text-muted-foreground size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </div>
  );
}

import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  description,
  actions,
}: {
  title: string;
  subtitle: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
          {title}
          <br />
          <span className="text-muted-foreground">{subtitle}</span>
        </h1>
        {description && (
          <p className="text-muted-foreground mt-4 text-sm">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  icon,
  inverted,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
  inverted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-6 ${inverted ? "bg-foreground text-background" : "bg-muted"}`}
    >
      <div
        className={`flex justify-between text-sm ${inverted ? "text-background/70" : "text-muted-foreground"}`}
      >
        {label}
        {icon}
      </div>
      <p className="mt-8 text-3xl tracking-tight tabular-nums">{value}</p>
      {note && (
        <p
          className={`mt-2 text-xs ${inverted ? "text-background/60" : "text-muted-foreground"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";

import { usePrivateAmounts } from "./privacy";

export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
        {title}
      </h1>
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
  const hidden = usePrivateAmounts();
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
      <p className="mt-8 text-3xl tracking-tight tabular-nums">
        {hidden ? "••••••" : value}
      </p>
      {note && !hidden && (
        <p
          className={`mt-2 text-xs ${inverted ? "text-background/60" : "text-muted-foreground"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

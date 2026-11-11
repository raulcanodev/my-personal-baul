import type { ReactNode } from "react";

/** One block of a settings page: title, optional one-line hint, content on a muted card */
export function SettingsSection({
  title,
  description,
  action,
  children,
  bare,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Content without the muted card (lists that bring their own) */
  bare?: boolean;
}) {
  return (
    <section className="max-w-3xl [&+&]:mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">{title}</h2>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className={bare ? "mt-4" : "bg-muted mt-4 rounded-xl p-5"}>
        {children}
      </div>
    </section>
  );
}

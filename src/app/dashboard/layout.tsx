import type { ReactNode } from "react";

import { AppShell } from "@/components/baul/shell";
import { requireSession } from "@/server/better-auth/server";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await requireSession();
  return (
    <AppShell userName={user.displayUsername ?? user.name}>{children}</AppShell>
  );
}

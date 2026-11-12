import { notFound } from "next/navigation";

import { AdminView } from "@/components/baul/views/admin-view";
import { requireSession } from "@/server/better-auth/server";

export default async function AdminPage() {
  const { user } = await requireSession();
  if (user.role !== "admin") notFound();
  return <AdminView />;
}

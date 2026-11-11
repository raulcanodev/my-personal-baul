import { redirect } from "next/navigation";

import { ConsentForm } from "@/components/baul/consent-form";
import { getSession } from "@/server/better-auth/server";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (!(await getSession())) {
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v]] : [],
      ),
    );
    redirect(`/login?${query.toString()}`);
  }
  return <ConsentForm />;
}

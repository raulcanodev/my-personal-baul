import { redirect } from "next/navigation";

// Preserve links and callbacks created before the standalone connection page.
export default async function LegacyConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["country", "result", "error", "method"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }
  redirect(`/conectar-banco${query.size ? `?${query}` : ""}`);
}

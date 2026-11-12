import { redirect } from "next/navigation";

import { AuthForm } from "@/components/baul/login-form";
import { getSession } from "@/server/better-auth/server";
import { getSignupStatus } from "@/server/better-auth/signup";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const signup = await getSignupStatus();
  // Invite links (/registro?codigo=…) fill the code in
  const { codigo } = await searchParams;
  return <AuthForm mode="register" signup={signup} inviteCode={codigo} />;
}

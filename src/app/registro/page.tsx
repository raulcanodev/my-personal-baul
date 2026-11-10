import { redirect } from "next/navigation";

import { AuthForm } from "@/components/baul/login-form";
import { getSession } from "@/server/better-auth/server";
import { getSignupStatus } from "@/server/better-auth/signup";

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard");
  const signup = await getSignupStatus();
  if (signup === "closed") redirect("/login");
  return <AuthForm mode="register" signup={signup} />;
}

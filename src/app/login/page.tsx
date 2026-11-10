import { redirect } from "next/navigation";

import { AuthForm } from "@/components/baul/login-form";
import { getSession } from "@/server/better-auth/server";
import { getSignupStatus } from "@/server/better-auth/signup";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  const signup = await getSignupStatus();
  // Nobody has an account yet: straight to creating the first one
  if (signup === "open") redirect("/registro");
  return <AuthForm mode="login" signup={signup} />;
}

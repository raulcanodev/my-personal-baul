import { redirect } from "next/navigation";

import { LoginForm } from "@/components/baul/login-form";
import { getSession } from "@/server/better-auth/server";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return <LoginForm />;
}

import { NextResponse } from "next/server";
import { getSession } from "@/server/better-auth/server";
import { getBaseURL } from "@/server/better-auth/config";
import { getDb } from "@/server/db";
import {
  enableConfiguration,
  startEnableAuthorization,
} from "@/server/finance/enablebanking";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(getBaseURL()).origin)
    return new Response("Origen no permitido", { status: 403 });
  const session = await getSession();
  if (!session) return new Response("Inicia sesión", { status: 401 });
  const credentials = enableConfiguration(session.user.id);
  if (!credentials)
    return new Response("Conexión no habilitada para esta cuenta", {
      status: 403,
    });
  const form = await request.formData();
  const country = form.get("country");
  const bank = form.get("bank");
  if (typeof country !== "string" || typeof bank !== "string")
    return new Response("Datos no válidos", { status: 400 });
  if (bank.length > 200)
    return new Response("Banco no válido", { status: 400 });
  try {
    return NextResponse.redirect(
      await startEnableAuthorization(
        { db: getDb(), userId: session.user.id },
        credentials,
        country,
        bank,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      new URL("/conectar-banco?error=start", getBaseURL()),
      303,
    );
  }
}

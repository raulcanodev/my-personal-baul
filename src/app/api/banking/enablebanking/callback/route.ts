import { NextResponse } from "next/server";
import { getSession } from "@/server/better-auth/server";
import { getBaseURL } from "@/server/better-auth/config";
import { getDb } from "@/server/db";
import {
  enableConfiguration,
  completeEnableAuthorization,
} from "@/server/finance/enablebanking";
import { syncConnectionById } from "@/server/finance/connections";
import { getEncryptionSecret } from "@/server/finance/context";

export async function GET(request: Request) {
  const destination = new URL(
    "/dashboard/ajustes/bancos/conectar",
    getBaseURL(),
  );
  const finish = (status: string) => {
    destination.searchParams.set("result", status);
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const session = await getSession();
  if (!session) return finish("login");
  const credentials = enableConfiguration(session.user.id);
  if (!credentials) return finish("forbidden");
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state || state.length > 100 || (code?.length ?? 0) > 4096)
    return finish("invalid");
  try {
    const ctx = { db: getDb(), userId: session.user.id };
    const id = await completeEnableAuthorization(
      ctx,
      credentials,
      state,
      params.has("error") ? null : code,
    );
    try {
      const sync = await syncConnectionById(ctx, id, getEncryptionSecret());
      return finish(sync.errors.length ? "partial" : "connected");
    } catch {
      return finish("partial");
    }
  } catch {
    return finish("invalid");
  }
}

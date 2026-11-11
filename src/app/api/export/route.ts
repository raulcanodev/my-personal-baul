import { getDb } from "@/server/db";
import { exportAll, exportTransactionsCsv } from "@/server/account/export";
import { getSession } from "@/server/better-auth/server";

// GET /api/export?format=json|csv — download of the signed-in user's data
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("No autorizado", { status: 401 });
  const format =
    new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const day = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const csv = await exportTransactionsCsv(getDb(), session.user.id);
    return new Response(`﻿${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="baul-movimientos-${day}.csv"`,
      },
    });
  }
  const data = await exportAll(getDb(), session.user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="baul-${day}.json"`,
    },
  });
}

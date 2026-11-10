import { and, asc, eq } from "drizzle-orm";

import {
  categories,
  type CATEGORY_KINDS,
  type SCOPES,
} from "@/server/db/schema";
import type { FinanceContext } from "./context";
import { newId } from "./ids";

type Kind = (typeof CATEGORY_KINDS)[number];
type Scope = (typeof SCOPES)[number];

const DEFAULTS: { name: string; kind: Kind; scope: Scope; color: string }[] = [
  { name: "Servidores", kind: "expense", scope: "work", color: "#64748b" },
  {
    name: "IA y herramientas",
    kind: "expense",
    scope: "work",
    color: "#7c3aed",
  },
  { name: "Software", kind: "expense", scope: "work", color: "#0891b2" },
  { name: "Hogar", kind: "expense", scope: "personal", color: "#b45309" },
  { name: "Comida", kind: "expense", scope: "personal", color: "#65a30d" },
  { name: "Transporte", kind: "expense", scope: "personal", color: "#0f766e" },
  {
    name: "Ocio y caprichos",
    kind: "expense",
    scope: "personal",
    color: "#db2777",
  },
  { name: "Streaming", kind: "expense", scope: "personal", color: "#dc2626" },
  { name: "Salud", kind: "expense", scope: "personal", color: "#16a34a" },
  { name: "Ingresos", kind: "income", scope: "work", color: "#15803d" },
  {
    name: "Transferencias",
    kind: "transfer",
    scope: "personal",
    color: "#a8a29e",
  },
];

export async function listCategories({ db, userId }: FinanceContext) {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.name));
  if (rows.length > 0) return rows;
  // First visit: a sensible starting set, editable afterwards
  await db.batch(
    DEFAULTS.map((c) =>
      db
        .insert(categories)
        .values({ id: newId("cat"), userId, ...c })
        .onConflictDoNothing(),
    ) as [never, ...never[]],
  );
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.name));
}

export async function createCategory(
  { db, userId }: FinanceContext,
  input: { name: string; kind: Kind; scope: Scope; color?: string },
) {
  const [row] = await db
    .insert(categories)
    .values({ id: newId("cat"), userId, ...input })
    .returning();
  return row!;
}

export async function updateCategory(
  { db, userId }: FinanceContext,
  id: string,
  input: Partial<{ name: string; kind: Kind; scope: Scope; color: string }>,
) {
  await db
    .update(categories)
    .set(input)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

export async function deleteCategory(
  { db, userId }: FinanceContext,
  id: string,
) {
  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

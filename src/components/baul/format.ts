export function money(
  cents: number,
  currency = "EUR",
  opts: { sign?: boolean } = {},
) {
  const value = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  if (!opts.sign) return cents < 0 ? `−${value}` : value;
  return `${cents < 0 ? "−" : "+"}${value}`;
}

/** "12,50" or "12.5" → 1250 */
export function parseCents(value: string) {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export const centsToInput = (cents: number) =>
  (cents / 100).toFixed(2).replace(".", ",");

export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-ES", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
  }).format(new Date(y!, m! - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const shortDate = (date: Date | string) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(
    new Date(date),
  );

export function relativeTime(date: Date | string | null) {
  if (!date) return "nunca";
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

export const SCOPE_LABEL = { personal: "Personal", work: "Trabajo" } as const;
export const CYCLE_LABEL = {
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
} as const;
export const FLOW_CYCLE_LABEL = { once: "Una vez", ...CYCLE_LABEL } as const;
export const DEBT_KIND_LABEL = {
  loan: "Préstamo",
  financing: "Financiación",
  credit_card: "Tarjeta de crédito",
  other: "Otra deuda",
} as const;
export const KIND_LABEL = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
} as const;

/** A text field from a submitted form ("" when missing) */
export function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

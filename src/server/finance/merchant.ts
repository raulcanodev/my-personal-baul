// Turns a bank line into a stable merchant key ("CARD PAYMENT VERCEL INC 1234 SAN FRANCISCO" →
// "vercel inc"). Merchant rules match on it, so one decision ("Vercel is Servidores") applies
// to every future charge.

// Wise COMPACT statements describe the counterparty inside the text
const DESCRIPTION_PATTERNS = [
  /issued by (.+)$/i,
  /(?:sent money|transfer|payment) to (.+)$/i,
  /received money from (.+)$/i,
  /(?:pago|compra) en (.+)$/i,
];

const NOISE =
  /\b(card|payment|transaction|purchase|pago|compra|tarjeta|transfer|transferencia|sent|received|money|ref|via|eur|usd|gbp)\b/g;

export function normalizeMerchant(
  counterparty: string | null | undefined,
  description: string,
) {
  let source = counterparty?.trim() ? counterparty : description;
  if (!counterparty?.trim()) {
    for (const pattern of DESCRIPTION_PATTERNS) {
      const match = pattern.exec(description);
      if (match?.[1]) {
        source = match[1];
        break;
      }
    }
  }
  const cleaned = source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*#:/\\_.,()-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Two words: enough to tell merchants apart, short enough to drop cities and references
  return cleaned.split(" ").slice(0, 2).join(" ") || null;
}

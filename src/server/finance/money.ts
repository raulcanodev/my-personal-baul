import type { BillingCycle } from "@/server/db/schema";

export const BASE_CURRENCY = "EUR";

export const toCents = (amount: number) => Math.round(amount * 100);

const MONTHLY_FACTOR: Record<BillingCycle, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

/** What a subscription costs per month, whatever its billing cycle */
export const monthlyCents = (amountCents: number, cycle: BillingCycle) =>
  Math.round(amountCents * MONTHLY_FACTOR[cycle]);

// Same source as papra (frankfurter, ECB rates), cached per isolate for an hour
const CACHE_TTL_MS = 60 * 60 * 1000;
let cachedRates: { rates: Record<string, number>; fetchedAt: number } | null =
  null;

/** Rates from BASE_CURRENCY: 1 EUR = rates[X] X */
export async function getRates(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() - cachedRates.fetchedAt < CACHE_TTL_MS) {
    return cachedRates.rates;
  }
  try {
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${BASE_CURRENCY}`,
    );
    if (!response.ok)
      throw new Error(`Exchange rate API error: ${response.status}`);
    const data: { rates: Record<string, number> } = await response.json();
    cachedRates = {
      rates: { ...data.rates, [BASE_CURRENCY]: 1 },
      fetchedAt: Date.now(),
    };
  } catch {
    // Totals still render with the last known (or no) rates
    if (!cachedRates) return { [BASE_CURRENCY]: 1 };
  }
  return cachedRates.rates;
}

/** Converts to the base currency; unknown currencies are left as they are */
export function toBase(
  amountCents: number,
  currency: string,
  rates: Record<string, number>,
) {
  const rate = rates[currency];
  return rate ? Math.round(amountCents / rate) : amountCents;
}

export const todayIso = (date = new Date()) => date.toISOString().slice(0, 10);

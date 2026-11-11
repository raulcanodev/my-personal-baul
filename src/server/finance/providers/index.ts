import { createEnableBankingAdapter } from "./enablebanking";
import type { BankProvider } from "@/server/db/schema";
import { createMercuryAdapter } from "./mercury";
import type { BankProviderAdapter } from "./types";
import { createWiseAdapter } from "./wise";

const adapters: Record<BankProvider, () => BankProviderAdapter> = {
  mercury: createMercuryAdapter,
  enablebanking: createEnableBankingAdapter,
  wise: createWiseAdapter,
};

export function getBankProviderAdapter(provider: BankProvider) {
  return adapters[provider]();
}

export type {
  BankProviderAdapter,
  ProviderBalance,
  ProviderTransaction,
} from "./types";

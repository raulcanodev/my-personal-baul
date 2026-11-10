// Copied from papra (apps/paqui-server/src/modules/finances/providers). Amounts stay in major units
// here; the sync converts them to cents.
export type ProviderTransaction = {
  externalId: string;
  date: Date;
  description: string;
  amount: number;
  currency: string;
  counterparty?: string;
  status: "pending" | "posted";
  rawData: Record<string, unknown>;
};

export type ProviderAccount = {
  id: string;
  name: string;
};

export type ProviderBalance = {
  accountId: string;
  accountName: string;
  balance: number;
  currency: string;
};

export type BankProviderAdapter = {
  fetchTransactions: (args: {
    apiKey: string;
    accountId?: string;
    fromDate?: Date;
  }) => Promise<{ transactions: ProviderTransaction[] }>;
  fetchAccounts: (args: {
    apiKey: string;
  }) => Promise<{ accounts: ProviderAccount[] }>;
  validateApiKey: (args: { apiKey: string }) => Promise<{ isValid: boolean }>;
  fetchBalances: (args: {
    apiKey: string;
  }) => Promise<{ balances: ProviderBalance[] }>;
};

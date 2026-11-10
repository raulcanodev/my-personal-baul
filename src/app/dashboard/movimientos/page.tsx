import { Suspense } from "react";

import { TransactionsView } from "@/components/baul/views/transactions-view";

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsView />
    </Suspense>
  );
}

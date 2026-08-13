import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../lib/apiClient";

export interface TransactionItem {
  id: string;
  direction: "INCOME" | "EXPENSE";
  amountMinor: number;
  currency: string;
  description: string | null;
  occurredOn: string;
  status: "DRAFT" | "CONFIRMED";
  category: { id: string; name: string; type: "INCOME" | "EXPENSE" };
}

interface TransactionPage {
  items: TransactionItem[];
  nextCursor: string | null;
}

export function useTransactionsQuery() {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: () => apiRequest<TransactionPage>("/api/transactions"),
  });
}

interface SummaryResponse {
  from: string;
  to: string;
  totals: { incomeMinor: number; expenseMinor: number; netMinor: number };
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const toIso = (date: Date) => date.toISOString().slice(0, 10);

  return {
    from: toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function useSummaryQuery() {
  const { from, to } = currentMonthRange();

  return useQuery({
    queryKey: ["transactions", "summary", from, to],
    queryFn: () => apiRequest<SummaryResponse>(`/api/transactions/summary?from=${from}&to=${to}`),
  });
}

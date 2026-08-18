import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";
import { toLocalIsoDate } from "../lib/dates";
import type { TransactionItem } from "../lib/types";

interface TransactionPage {
  items: TransactionItem[];
  nextCursor: string | null;
}

interface TransactionResponse {
  transaction: TransactionItem;
}

export function useTransactionsQuery() {
  // queryClient hidup sepanjang hayat app, tidak dicipta semula bila
  // pengguna log keluar/masuk semula. Tanpa user.id dalam queryKey, kunci
  // "transactions" yang sama akan memaparkan data cache akaun SEBELUM ini
  // secara ringkas selepas tukar akaun (stale-while-revalidate memaparkan
  // cache dahulu sebelum sempat refetch) — kebocoran privasi merentasi akaun.
  const { user } = useAuth();

  return useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: () => apiRequest<TransactionPage>("/api/transactions"),
    enabled: user !== null,
  });
}

interface SummaryResponse {
  from: string;
  to: string;
  totals: { incomeMinor: number; expenseMinor: number; netMinor: number };
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();

  return {
    from: toLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function useSummaryQuery() {
  const { user } = useAuth();
  const { from, to } = currentMonthRange();

  return useQuery({
    queryKey: ["transactions", "summary", user?.id, from, to],
    queryFn: () => apiRequest<SummaryResponse>(`/api/transactions/summary?from=${from}&to=${to}`),
    enabled: user !== null,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: unknown) =>
      apiRequest<TransactionResponse>("/api/transactions", { method: "POST", body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

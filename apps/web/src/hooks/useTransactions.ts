import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../context/AuthContext";
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

// new Date(y, m, d) mencipta tarikh pada tengah malam TEMPATAN, tetapi
// .toISOString() menukarnya kepada UTC dahulu sebelum format — bagi pengguna
// di timur UTC (Malaysia, UTC+8), tengah malam tempatan 1 Ogos menjadi 31
// Julai 16:00 UTC, jadi .toISOString().slice(0, 10) yang lama akan pulangkan
// "31" bukan "01". Fungsi ini terus membaca komponen tempatan (getFullYear/
// getMonth/getDate) tanpa sebarang penukaran UTC.
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

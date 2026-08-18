import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../context/AuthContext";
import { apiRequest, apiUpload } from "../lib/apiClient";
import type { ReceiptItem, TransactionItem } from "../lib/types";

interface ReceiptListResponse {
  receipts: ReceiptItem[];
}

interface ReceiptResponse {
  receipt: ReceiptItem;
}

interface ConfirmResponse {
  transaction: TransactionItem;
}

function isInFlight(status: ReceiptItem["status"]): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

export function useReceiptsQuery() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["receipts", user?.id],
    queryFn: async () => {
      const body = await apiRequest<ReceiptListResponse>("/api/receipts");
      return body.receipts;
    },
    enabled: user !== null,
    // Pekerja OCR biasanya siap dalam beberapa saat. Poll hanya semasa ada
    // resit yang masih PENDING/PROCESSING; berhenti bila semuanya PARSED,
    // FAILED, atau sudah disahkan.
    refetchInterval: (query) => {
      const receipts = query.state.data ?? [];
      return receipts.some((receipt) => isInFlight(receipt.status)) ? 2_000 : false;
    },
  });
}

export function useUploadReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => apiUpload<ReceiptResponse>("/api/receipts", file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["receipts"] });
    },
  });
}

export function useConfirmReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      apiRequest<ConfirmResponse>(`/api/receipts/${id}/confirm`, { method: "POST", body }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
  });
}

import type {
  CategoryType,
  ReceiptStatus,
  TransactionDirection,
  TransactionStatus,
} from "@resitku/shared";

export interface CategoryItem {
  id: string;
  name: string;
  type: CategoryType;
  color: string | null;
}

export interface TransactionItem {
  id: string;
  direction: TransactionDirection;
  amountMinor: number;
  currency: string;
  description: string | null;
  occurredOn: string;
  status: TransactionStatus;
  category: { id: string; name: string; type: CategoryType };
}

export interface ReceiptItem {
  id: string;
  status: ReceiptStatus;
  contentType: string;
  sizeBytes: number;
  parsedVendor: string | null;
  parsedAmountMinor: number | null;
  parsedCurrency: string | null;
  parsedDate: string | null;
  confidence: number | null;
  errorMessage: string | null;
  transactionId: string | null;
  createdAt: string;
}

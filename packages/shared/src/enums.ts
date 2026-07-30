export const CATEGORY_TYPES = ["INCOME", "EXPENSE"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_DIRECTIONS = ["INCOME", "EXPENSE"] as const;
export type TransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number];

export const TRANSACTION_STATUSES = ["DRAFT", "CONFIRMED"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const RECEIPT_STATUSES = ["PENDING", "PROCESSING", "PARSED", "FAILED"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

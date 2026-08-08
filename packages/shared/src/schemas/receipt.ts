import * as z from "zod";

export const RECEIPT_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReceiptContentType = (typeof RECEIPT_CONTENT_TYPES)[number];

export function isReceiptContentType(value: string): value is ReceiptContentType {
  return (RECEIPT_CONTENT_TYPES as readonly string[]).includes(value);
}

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export const createReceiptUploadSchema = z.object({
  contentType: z.enum(RECEIPT_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_RECEIPT_BYTES),
});

export type CreateReceiptUploadInput = z.output<typeof createReceiptUploadSchema>;

export const textractResultSchema = z.object({
  vendor: z.string().trim().min(1).max(120).nullable(),
  amountMinor: z.number().int().positive().nullable(),
  currency: z.string().length(3).nullable(),
  occurredOn: z.iso.date().nullable(),
  confidence: z.number().min(0).max(100).nullable(),
});

export type TextractResult = z.output<typeof textractResultSchema>;

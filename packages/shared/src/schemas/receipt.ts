import * as z from "zod";

import { amountSchema, isoDateSchema } from "./common.js";

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

// Hanya categoryId yang wajib — OCR tidak boleh meneka kategori perbelanjaan.
// Medan lain sengaja pilihan: apabila ditinggalkan, receipt.service.ts jatuh
// balik kepada nilai yang Textract/stub kesan (parsedAmountMinor,
// parsedCurrency, parsedDate, parsedVendor). Ini membolehkan pengguna
// menerima cadangan OCR dengan satu klik, atau membetulkannya medan demi
// medan bila OCR tersilap.
export const confirmReceiptSchema = z.object({
  categoryId: z.uuid(),
  amount: amountSchema.optional(),
  // Bukan currencySchema daripada common.ts: skema itu mempunyai .default("MYR")
  // terbina di dalamnya, dan .optional() di atas skema yang berdefault tidak
  // kekal undefined bila medan ditinggalkan — ia terus jatuh kepada "MYR" dan
  // mustahil untuk receipt.service.ts membezakan "pengguna tidak override"
  // daripada "pengguna override dengan MYR". Regex yang sama tanpa default
  // mengelakkan capah itu.
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 code")
    .optional(),
  description: z.string().trim().max(280).optional(),
  occurredOn: isoDateSchema.optional(),
});

export type ConfirmReceiptInput = z.output<typeof confirmReceiptSchema>;

import * as z from "zod";

import { TRANSACTION_DIRECTIONS, TRANSACTION_STATUSES } from "../enums.js";
import { amountSchema, currencySchema, isoDateSchema, paginationSchema } from "./common.js";

export const createTransactionSchema = z.object({
  categoryId: z.uuid(),
  amount: amountSchema,
  currency: currencySchema,
  description: z.string().trim().max(280).optional(),
  occuredOn: isoDateSchema,
});

export const updateTransactionSchema = z
  .object({
    categoryId: z.uuid().optional(),
    amount: amountSchema.optional(),
    description: z.string().trim().max(280).nullable().optional(),
    occuredOn: isoDateSchema.optional(),
    status: z.enum(TRANSACTION_STATUSES).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "At least one field must be provided");

export const listTransactionsSchema = paginationSchema.extend({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  categoryId: z.uuid().optional(),
  direction: z.enum(TRANSACTION_DIRECTIONS).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
});

export const summaryQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
});

export type CreateTransactionInput = z.output<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.output<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.output<typeof listTransactionsSchema>;
export type SummaryQuery = z.output<typeof summaryQuerySchema>;

import * as z from "zod";

import { MAX_AMOUNT_MAJOR_DIGITS, toMinorUnits } from "../money.js";

export const uuidSchema = z.uuid();

export const isoDateSchema = z.iso.date();

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 code")
  .default("MYR");

const POSITIVE_DECIMAL = new RegExp(`^\\d{1,${MAX_AMOUNT_MAJOR_DIGITS}}(\\.\\d{1,2})?$`);

export const amountSchema = z
  .union([z.string().trim(), z.number()])
  .transform((value) => (typeof value === "number" ? value.toFixed(2) : value))
  .refine(
    (value) => POSITIVE_DECIMAL.test(value),
    `Amount must be a positive number with at most ${MAX_AMOUNT_MAJOR_DIGITS} digits and 2 decimal places`,
  )
  .transform((value) => toMinorUnits(value))
  .refine((minor) => minor > 0, "Amount must be greater than zero");

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export type Pagination = z.output<typeof paginationSchema>;

import * as z from "zod";

import { CATEGORY_TYPES } from "../enums.js";

export const categoryNameSchema = z.string().trim().min(1).max(40);

export const categoryColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour");

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  type: z.enum(CATEGORY_TYPES),
  color: categoryColorSchema.optional(),
});

export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    color: categoryColorSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "At least one field must be provided");

export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;

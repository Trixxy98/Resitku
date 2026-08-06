import { createCategorySchema, updateCategorySchema, uuidSchema } from "@resitku/shared";
import { Router } from "express";

import { getAuth, requireAuth } from "../middleware/require-auth.js";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../services/category.service.js";

export const categoryRouter: Router = Router();

categoryRouter.use(requireAuth);

categoryRouter.post("/", async (req, res) => {
  const body: unknown = req.body;
  const { userId } = getAuth(req);

  const category = await createCategory(userId, createCategorySchema.parse(body));

  res.status(201).json({ category });
});

categoryRouter.get("/", async (req, res) => {
  const { userId } = getAuth(req);

  res.json({ categories: await listCategories(userId) });
});

categoryRouter.patch("/:id", async (req, res) => {
  const body: unknown = req.body;
  const { userId } = getAuth(req);

  const category = await updateCategory(
    userId,
    uuidSchema.parse(req.params.id),
    updateCategorySchema.parse(body),
  );

  res.json({ category });
});

categoryRouter.delete("/:id", async (req, res) => {
  const { userId } = getAuth(req);

  await deleteCategory(userId, uuidSchema.parse(req.params.id));

  res.status(204).end();
});

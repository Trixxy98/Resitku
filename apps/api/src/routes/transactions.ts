import {
  createTransactionSchema,
  listTransactionsSchema,
  summaryQuerySchema,
  updateTransactionSchema,
  uuidSchema,
} from "@resitku/shared";
import { Router } from "express";

import { getAuth, requireAuth } from "../middleware/require-auth.js";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  getTransactionSummary,
  listTransactions,
  updateTransaction,
} from "../services/transaction.service.js";

export const transactionRouter: Router = Router();

/// Dipasang sekali untuk keseluruhan router dan bukan diulang pada setiap
/// laluan. Laluan yang ditambah kemudian terlindung secara lalai, dan tiada
/// siapa boleh terlupa.
transactionRouter.use(requireAuth);

transactionRouter.post("/", async (req, res) => {
  const body: unknown = req.body;
  const { userId } = getAuth(req);

  const transaction = await createTransaction(userId, createTransactionSchema.parse(body));

  res.status(201).json({ transaction });
});

transactionRouter.get("/", async (req, res) => {
  const query: unknown = req.query;
  const { userId } = getAuth(req);

  res.json(await listTransactions(userId, listTransactionsSchema.parse(query)));
});

transactionRouter.get("/summary", async (req, res) => {
  const query: unknown = req.query;
  const { userId } = getAuth(req);

  res.json(await getTransactionSummary(userId, summaryQuerySchema.parse(query)));
});

transactionRouter.get("/:id", async (req, res) => {
  const { userId } = getAuth(req);

  // Tanpa parse ini, sebarang rentetan sampah sampai ke Postgres sebagai uuid
  // dan pulang sebagai 500 dan bukan 400.
  const transaction = await getTransaction(userId, uuidSchema.parse(req.params.id));

  res.json({ transaction });
});

transactionRouter.patch("/:id", async (req, res) => {
  const body: unknown = req.body;
  const { userId } = getAuth(req);

  const transaction = await updateTransaction(
    userId,
    uuidSchema.parse(req.params.id),
    updateTransactionSchema.parse(body),
  );

  res.json({ transaction });
});

transactionRouter.delete("/:id", async (req, res) => {
  const { userId } = getAuth(req);

  await deleteTransaction(userId, uuidSchema.parse(req.params.id));

  res.status(204).end();
});

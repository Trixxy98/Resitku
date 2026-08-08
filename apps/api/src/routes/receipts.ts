import { isReceiptContentType, MAX_RECEIPT_BYTES, uuidSchema } from "@resitku/shared";
import { Router } from "express";
import multer from "multer";

import { HttpError } from "../lib/http-error.js";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import { createReceipt, getReceipt, listReceipts } from "../services/receipt.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (isReceiptContentType(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(HttpError.badRequest(`Unsupported file type: ${file.mimetype}`));
  },
});

export const receiptRouter: Router = Router();

receiptRouter.use(requireAuth);

receiptRouter.post("/", upload.single("file"), async (req, res) => {
  const { userId } = getAuth(req);

  if (req.file === undefined) {
    throw HttpError.badRequest('No file was uploaded under the "file" field');
  }

  // fileFilter sudah menolak jenis kandungan yang tidak dibenarkan; semakan
  // ini semata-mata menyempitkan jenis untuk TypeScript, bukan pertahanan
  // sebenar terhadap input yang tidak sah.
  if (!isReceiptContentType(req.file.mimetype)) {
    throw HttpError.badRequest(`Unsupported file type: ${req.file.mimetype}`);
  }

  const receipt = await createReceipt(userId, {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });

  res.status(201).json({ receipt });
});

receiptRouter.get("/", async (req, res) => {
  const { userId } = getAuth(req);

  res.json({ receipts: await listReceipts(userId) });
});

receiptRouter.get("/:id", async (req, res) => {
  const { userId } = getAuth(req);

  res.json({ receipt: await getReceipt(userId, uuidSchema.parse(req.params.id)) });
});

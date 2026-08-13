import {
  confirmReceiptSchema,
  isReceiptContentType,
  MAX_RECEIPT_BYTES,
  uuidSchema,
} from "@resitku/shared";
import { Router } from "express";
import multer from "multer";

import { HttpError } from "../lib/http-error.js";
import { sniffImageContentType } from "../lib/image-signature.js";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import {
  confirmReceipt,
  createReceipt,
  getReceipt,
  listReceipts,
} from "../services/receipt.service.js";

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

  // fileFilter di atas hanya menyemak MIME type YANG DIDAKWA oleh permintaan
  // — tidak ada apa yang menghalang klien daripada melabel bait sembarangan
  // sebagai "image/png". Mengesan tandatangan bait sebenar sebelum menyimpan
  // ke S3 atau menghantarnya ke saluran paip OCR menutup lubang itu; sniffed
  // menggantikan req.file.mimetype (yang hanya menyempitkan jenis untuk
  // TypeScript, bukan pertahanan input) sebagai sumber kebenaran sebenar.
  const sniffedContentType = sniffImageContentType(req.file.buffer);

  if (sniffedContentType === null || sniffedContentType !== req.file.mimetype) {
    throw HttpError.badRequest("File content does not match a supported image format");
  }

  const receipt = await createReceipt(userId, {
    buffer: req.file.buffer,
    mimetype: sniffedContentType,
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

receiptRouter.post("/:id/confirm", async (req, res) => {
  const body: unknown = req.body;
  const { userId } = getAuth(req);

  const transaction = await confirmReceipt(
    userId,
    uuidSchema.parse(req.params.id),
    confirmReceiptSchema.parse(body),
  );

  res.status(201).json({ transaction });
});

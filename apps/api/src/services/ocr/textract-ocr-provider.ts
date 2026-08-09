import { AnalyzeExpenseCommand, TextractClient } from "@aws-sdk/client-textract";
import type { ExpenseField } from "@aws-sdk/client-textract";
import type { TextractResult } from "@resitku/shared";

import { env } from "../../config/env.js";
import type { OcrExtraction, OcrProvider } from "./ocr-provider.js";

// Textract tidak mempunyai konsep "endpoint setempat" seperti MinIO/ElasticMQ
// — tiada emulator percuma yang setia untuk AnalyzeExpense, jadi pembekal ini
// sentiasa memanggil AWS sebenar dan hanya digunakan bila OCR_PROVIDER=textract.
const textractClient = new TextractClient({ region: env.AWS_REGION });

function findField(fields: ExpenseField[], type: string): ExpenseField | undefined {
  return fields.find((field) => field.Type?.Text === type);
}

function parseAmountMinor(text: string | undefined): number | null {
  if (text === undefined) {
    return null;
  }

  const cleaned = text.replace(/[^0-9.]/g, "");
  const value = Number.parseFloat(cleaned);

  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function parseOccurredOn(text: string | undefined): string | null {
  if (text === undefined) {
    return null;
  }

  // Textract memulangkan tarikh sebagai teks bebas seturut apa yang tertera
  // pada resit (format berbeza-beza ikut kedai), jadi ini sekadar percubaan
  // terbaik melalui penghurai tarikh JavaScript, bukan penghuraian format
  // eksplisit. Tarikh yang tidak dikenali pulang null dengan yakin, bukan
  // meneka nilai yang salah.
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export const textractOcrProvider: OcrProvider = {
  async extract({ buffer }): Promise<OcrExtraction> {
    const response = await textractClient.send(
      new AnalyzeExpenseCommand({ Document: { Bytes: buffer } }),
    );

    const fields = response.ExpenseDocuments?.[0]?.SummaryFields ?? [];
    const vendorField = findField(fields, "VENDOR_NAME");
    const totalField = findField(fields, "TOTAL");
    const dateField = findField(fields, "INVOICE_RECEIPT_DATE");

    const confidences = [vendorField, totalField, dateField]
      .map((field) => field?.ValueDetection?.Confidence)
      .filter((value): value is number => typeof value === "number");

    const result: TextractResult = {
      vendor: vendorField?.ValueDetection?.Text?.trim() || null,
      amountMinor: parseAmountMinor(totalField?.ValueDetection?.Text),
      // Textract tidak sentiasa mengesan mata wang secara berasingan daripada
      // jumlah. Kod ini andaikan Ringgit Malaysia buat masa ini — lanjutkan
      // di sini kalau resit dalam mata wang lain perlu disokong kelak.
      currency: totalField === undefined ? null : "MYR",
      occurredOn: parseOccurredOn(dateField?.ValueDetection?.Text),
      confidence:
        confidences.length > 0
          ? confidences.reduce((total, value) => total + value, 0) / confidences.length
          : null,
    };

    return { result, raw: response };
  },
};

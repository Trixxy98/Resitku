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

// Textract memulangkan tarikh sebagai teks bebas seturut apa yang tertera
// pada resit (format berbeza-beza ikut kedai). new Date(text) yang lama
// menghurainya secara kabur mengikut tafsiran locale JavaScript sendiri —
// "01/02/2026" ditafsir sebagai Jan 2 oleh new Date(), bukan 1 Februari
// seperti kebiasaan resit Malaysia (DD/MM/YYYY) — silap tanpa sebarang
// amaran. Senarai di bawah hanya menerima bentuk yang kita nyatakan secara
// eksplisit; apa-apa lain pulang null dengan yakin daripada meneka tarikh
// yang salah.
const DATE_PATTERNS: { regex: RegExp; toIso: (match: RegExpMatchArray) => string }[] = [
  // 2026-01-15
  { regex: /^(\d{4})-(\d{2})-(\d{2})$/, toIso: (m) => `${m[1]}-${m[2]}-${m[3]}` },
  // 15/01/2026 atau 15-01-2026 — hari dahulu, seperti kebiasaan resit Malaysia.
  { regex: /^(\d{2})[/-](\d{2})[/-](\d{4})$/, toIso: (m) => `${m[3]}-${m[2]}-${m[1]}` },
];

function parseOccurredOn(text: string | undefined): string | null {
  if (text === undefined) {
    return null;
  }

  const trimmed = text.trim();

  for (const pattern of DATE_PATTERNS) {
    const match = pattern.regex.exec(trimmed);

    if (match === null) {
      continue;
    }

    const iso = pattern.toIso(match);
    const parsed = new Date(iso);

    // Regex sudah pastikan bentuk yang betul; semakan pusingan-ganti ini
    // menangkap nilai yang mustahil (cth. bulan 13, 30 Februari) yang bentuk
    // sahaja tidak dapat tolak — new Date menormalkannya senyap-senyap
    // kepada tarikh lain melainkan kita bandingkan semula.
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
  }

  return null;
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

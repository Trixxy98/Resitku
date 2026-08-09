import type { OcrExtraction, OcrProvider } from "./ocr-provider.js";

const DEMO_VENDORS = [
  "Kedai Runcit Pak Cik",
  "Restoran Warisan",
  "Klinik Sihat Sentosa",
  "Pasar Raya Mesra",
] as const;

/// Tiada panggilan rangkaian sebenar di sini. Ini membolehkan keseluruhan
/// saluran paip (muat naik -> S3 -> pekerja -> Postgres) diuji tempatan dan
/// dalam ujian automatik tanpa kos Textract sebenar. Nilai berbeza mengikut
/// saiz fail semata-mata supaya demo tidak kelihatan seperti data pegun —
/// ini BUKAN pengekstrakan sebenar dan tidak sepatutnya digunakan dalam
/// produksi (lihat OCR_PROVIDER dalam config/env.ts).
export const stubOcrProvider: OcrProvider = {
  // eslint-disable-next-line @typescript-eslint/require-await -- keeps the OcrProvider interface async for every implementation
  async extract({ buffer, contentType }): Promise<OcrExtraction> {
    const vendor = DEMO_VENDORS[buffer.length % DEMO_VENDORS.length] ?? DEMO_VENDORS[0];
    const amountMinor = 500 + (buffer.length % 15_000);

    return {
      result: {
        vendor,
        amountMinor,
        currency: "MYR",
        occurredOn: new Date().toISOString().slice(0, 10),
        confidence: 95,
      },
      raw: {
        provider: "stub",
        note: "Fixture data, not a real OCR extraction",
        contentType,
        bytesReceived: buffer.length,
      },
    };
  },
};

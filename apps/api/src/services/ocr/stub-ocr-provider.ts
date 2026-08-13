import type { OcrExtraction, OcrProvider } from "./ocr-provider.js";

const DEMO_VENDORS = [
  "Kedai Runcit Pak Cik",
  "Restoran Warisan",
  "Klinik Sihat Sentosa",
  "Pasar Raya Mesra",
] as const;

// Titik tolak sembarangan supaya occurredOn di bawah tetap dalam tahun-tahun
// yang munasabah tanpa perlu bergantung pada bila ujian sebenarnya berjalan.
const STUB_DATE_ANCHOR_MS = Date.parse("2026-01-01T00:00:00.000Z");
const MS_PER_DAY = 86_400_000;

/// Tiada panggilan rangkaian sebenar di sini. Ini membolehkan keseluruhan
/// saluran paip (muat naik -> S3 -> pekerja -> Postgres) diuji tempatan dan
/// dalam ujian automatik tanpa kos Textract sebenar. Nilai berbeza mengikut
/// saiz fail semata-mata supaya demo tidak kelihatan seperti data pegun —
/// ini BUKAN pengekstrakan sebenar dan tidak sepatutnya digunakan dalam
/// produksi (lihat OCR_PROVIDER dalam config/env.ts). occurredOn sengaja
/// diturunkan daripada buffer.length (bukan new Date()) supaya bait input
/// yang sama menghasilkan hasil yang sama pada bila-bila masa dipanggil —
/// new Date() sebelum ini menjadikan ujian yang menegaskan tarikh tertentu
/// mustahil dan hasil "deterministik" itu sebenarnya berubah setiap hari.
export const stubOcrProvider: OcrProvider = {
  // eslint-disable-next-line @typescript-eslint/require-await -- keeps the OcrProvider interface async for every implementation
  async extract({ buffer, contentType }): Promise<OcrExtraction> {
    const vendor = DEMO_VENDORS[buffer.length % DEMO_VENDORS.length] ?? DEMO_VENDORS[0];
    const amountMinor = 500 + (buffer.length % 15_000);
    const occurredOn = new Date(STUB_DATE_ANCHOR_MS + (buffer.length % 90) * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);

    return {
      result: {
        vendor,
        amountMinor,
        currency: "MYR",
        occurredOn,
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

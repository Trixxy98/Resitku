import type { ReceiptContentType, TextractResult } from "@resitku/shared";

export interface OcrExtraction {
  result: TextractResult;
  /// Respons mentah pembekal, disimpan dalam receipts.raw_result untuk debug
  /// kualiti pengekstrakan. Bentuknya berbeza mengikut pembekal, jadi
  /// dibiarkan tidak ditaip di sini dengan sengaja.
  raw: unknown;
}

export interface OcrProvider {
  extract(input: { buffer: Buffer; contentType: ReceiptContentType }): Promise<OcrExtraction>;
}

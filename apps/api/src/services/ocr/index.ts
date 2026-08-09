import { env } from "../../config/env.js";
import type { OcrProvider } from "./ocr-provider.js";
import { stubOcrProvider } from "./stub-ocr-provider.js";
import { textractOcrProvider } from "./textract-ocr-provider.js";

export type { OcrExtraction, OcrProvider } from "./ocr-provider.js";

export function createOcrProvider(): OcrProvider {
  return env.OCR_PROVIDER === "textract" ? textractOcrProvider : stubOcrProvider;
}

import type { ReceiptContentType } from "@resitku/shared";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Signature {
  contentType: ReceiptContentType;
  matches: (buffer: Buffer) => boolean;
}

const SIGNATURES: Signature[] = [
  { contentType: "image/png", matches: (buffer) => buffer.subarray(0, 8).equals(PNG_SIGNATURE) },
  {
    contentType: "image/jpeg",
    matches: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    contentType: "image/webp",
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

/// multer's fileFilter only trusts the client-declared Content-Type header
/// on the multipart part — nothing stops a request from lying and labelling
/// arbitrary bytes "image/png". Sniffing the actual leading bytes against
/// each format's magic number catches that before the bytes ever reach S3
/// or the OCR pipeline. Returns null when the bytes don't match any format
/// we support, regardless of what the request claimed.
export function sniffImageContentType(buffer: Buffer): ReceiptContentType | null {
  return SIGNATURES.find((signature) => signature.matches(buffer))?.contentType ?? null;
}

import { MAX_RECEIPT_BYTES, isReceiptContentType } from "@resitku/shared";
import { useState, type DragEvent, type FormEvent } from "react";

import { useUploadReceipt } from "../hooks/useReceipts";
import { ApiError } from "../lib/apiClient";
import { errorClass, mutedClass, primaryButtonClass } from "../lib/formStyles";

interface ReceiptUploadFormProps {
  onUploaded?: () => void;
}

export function ReceiptUploadForm({ onUploaded }: ReceiptUploadFormProps) {
  const upload = useUploadReceipt();
  const [clientError, setClientError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function applyFile(file: File | undefined, input?: HTMLInputElement): boolean {
    if (file === undefined) {
      return false;
    }

    setClientError(null);

    if (!isReceiptContentType(file.type)) {
      setClientError("Hanya JPEG, PNG atau WebP.");
      return false;
    }

    if (file.size > MAX_RECEIPT_BYTES) {
      setClientError("Fail melebihi 5 MB.");
      return false;
    }

    if (input !== undefined) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    }

    setFileName(file.name);
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const form = event.currentTarget;
    const input = form.elements.namedItem("file");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;

    if (file === undefined) {
      setClientError("Pilih fail gambar dahulu.");
      return;
    }

    if (!applyFile(file)) {
      return;
    }

    try {
      await upload.mutateAsync(file);
      form.reset();
      setFileName(null);
      onUploaded?.();
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "Gagal memuat naik resit.");
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragging(false);

    const form = event.currentTarget.closest("form");
    const input = form?.elements.namedItem("file");
    const dropped = event.dataTransfer.files[0];

    if (input instanceof HTMLInputElement) {
      applyFile(dropped, input);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <label
        htmlFor="file"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-amber bg-amber/10" : "border-line bg-ink-3/60 hover:border-amber/60"
        }`}
      >
        <span className="font-display text-2xl text-amber">Snap resit</span>
        <p className={`mt-2 max-w-sm ${mutedClass}`}>
          Letak gambar di sini atau ketik untuk pilih. Sistem baca jumlah dan tarikh.
        </p>
        <p className="mt-3 text-xs text-mute">JPEG, PNG atau WebP · maksimum 5 MB</p>
        {fileName !== null && <p className="mt-3 text-sm font-medium text-paper">{fileName}</p>}
        <input
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => applyFile(event.target.files?.[0])}
        />
      </label>
      {clientError !== null && <p className={errorClass}>{clientError}</p>}
      <button type="submit" disabled={upload.isPending} className={primaryButtonClass}>
        {upload.isPending ? "Memuat naik…" : "Muat naik resit"}
      </button>
    </form>
  );
}

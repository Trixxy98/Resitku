import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_RECEIPT_BYTES,
  formatAmount,
  isoDateSchema,
  isReceiptContentType,
  toDecimalString,
} from "@resitku/shared";
import { useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useCategoriesQuery } from "../hooks/useCategories";
import { useConfirmReceipt, useReceiptsQuery, useUploadReceipt } from "../hooks/useReceipts";
import { ApiError } from "../lib/apiClient";
import { fieldClass, primaryButtonClass } from "../lib/formStyles";
import type { CategoryItem, ReceiptItem } from "../lib/types";

export function ReceiptsPage() {
  const receipts = useReceiptsQuery();
  const categories = useCategoriesQuery();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Resit</h1>
      <p className="mt-1 text-sm text-slate-500">
        Muat naik gambar resit. Sistem membaca jumlah dan tarikh, kemudian anda sahkan jadi
        transaksi.
      </p>

      <ReceiptUploadForm />

      <section className="mt-8 space-y-3">
        {receipts.isLoading && <p className="text-sm text-slate-500">Memuatkan…</p>}
        {receipts.isError && <p className="text-sm text-red-600">Gagal memuatkan resit.</p>}
        {receipts.data?.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            Belum ada resit.
          </p>
        )}
        {receipts.data?.map((receipt) => (
          <ReceiptCard key={receipt.id} receipt={receipt} categories={categories.data ?? []} />
        ))}
      </section>
    </div>
  );
}

function ReceiptUploadForm() {
  const upload = useUploadReceipt();
  const [clientError, setClientError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setClientError(null);

    const form = event.currentTarget;
    const input = form.elements.namedItem("file");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;

    if (file === undefined) {
      setClientError("Pilih fail gambar dahulu.");
      return;
    }

    if (!isReceiptContentType(file.type)) {
      setClientError("Hanya JPEG, PNG atau WebP.");
      return;
    }

    if (file.size > MAX_RECEIPT_BYTES) {
      setClientError("Fail melebihi 5 MB.");
      return;
    }

    try {
      await upload.mutateAsync(file);
      form.reset();
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "Gagal memuat naik resit.");
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-6"
    >
      <label htmlFor="file" className="block text-sm font-medium text-slate-700">
        Gambar resit
      </label>
      <input
        id="file"
        name="file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
      />
      {clientError !== null && <p className="text-sm text-red-600">{clientError}</p>}
      <button type="submit" disabled={upload.isPending} className={primaryButtonClass}>
        {upload.isPending ? "Memuat naik…" : "Muat naik"}
      </button>
    </form>
  );
}

function ReceiptCard({
  receipt,
  categories,
}: {
  receipt: ReceiptItem;
  categories: CategoryItem[];
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{receipt.parsedVendor ?? "Resit"}</p>
          <p className="text-xs text-slate-500">
            {new Date(receipt.createdAt).toLocaleString("ms-MY")} · {statusLabel(receipt.status)}
          </p>
        </div>
        {receipt.parsedAmountMinor !== null && (
          <p className="text-sm font-semibold text-slate-900">
            {formatAmount(receipt.parsedAmountMinor, receipt.parsedCurrency ?? "MYR")}
          </p>
        )}
      </div>

      {receipt.status === "PENDING" || receipt.status === "PROCESSING" ? (
        <p className="mt-3 text-sm text-slate-500">Sedang dibaca… biarkan tab ini terbuka.</p>
      ) : null}

      {receipt.status === "FAILED" && receipt.errorMessage !== null ? (
        <p className="mt-3 text-sm text-red-600">{receipt.errorMessage}</p>
      ) : null}

      {receipt.transactionId !== null ? (
        <p className="mt-3 text-sm text-emerald-700">Sudah disahkan sebagai transaksi.</p>
      ) : null}

      {(receipt.status === "PARSED" || receipt.status === "FAILED") &&
      receipt.transactionId === null ? (
        <ReceiptConfirmForm receipt={receipt} categories={categories} />
      ) : null}
    </article>
  );
}

function statusLabel(status: ReceiptItem["status"]): string {
  switch (status) {
    case "PENDING":
      return "Menunggu";
    case "PROCESSING":
      return "Diproses";
    case "PARSED":
      return "Sedia disahkan";
    case "FAILED":
      return "Gagal dibaca";
    default:
      return "Tidak diketahui";
  }
}

/// Skema borang, bukan confirmReceiptSchema — skema API menukar amount kepada
/// unit sen, sama seperti createTransactionSchema.
const optionalAmountSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, "Jumlah mesti nombor positif, maksimum 2 perpuluhan")
    .refine((value) => Number(value) > 0, "Jumlah mesti lebih daripada sifar"),
]);

const confirmFormSchema = z.object({
  categoryId: z.uuid("Pilih kategori"),
  amount: optionalAmountSchema,
  occurredOn: z.union([z.literal(""), isoDateSchema]),
  description: z.string().trim().max(280),
});

type ConfirmValues = z.infer<typeof confirmFormSchema>;

function ReceiptConfirmForm({
  receipt,
  categories,
}: {
  receipt: ReceiptItem;
  categories: CategoryItem[];
}) {
  const confirm = useConfirmReceipt();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ConfirmValues>({
    resolver: zodResolver(confirmFormSchema),
    defaultValues: {
      categoryId: "",
      amount: receipt.parsedAmountMinor === null ? "" : toDecimalString(receipt.parsedAmountMinor),
      occurredOn: receipt.parsedDate ?? "",
      description: receipt.parsedVendor ?? "",
    },
  });

  const expense = categories.filter((category) => category.type === "EXPENSE");
  const income = categories.filter((category) => category.type === "INCOME");

  async function onSubmit(values: ConfirmValues): Promise<void> {
    if (values.amount === "" && receipt.parsedAmountMinor === null) {
      setError("amount", { message: "Isi jumlah — OCR tidak mengesan." });
      return;
    }

    if (values.occurredOn === "" && receipt.parsedDate === null) {
      setError("occurredOn", { message: "Isi tarikh — OCR tidak mengesan." });
      return;
    }

    const body: Record<string, string> = { categoryId: values.categoryId };

    if (values.amount.length > 0) {
      body["amount"] = values.amount;
    }

    if (values.occurredOn.length > 0) {
      body["occurredOn"] = values.occurredOn;
    }

    if (values.description.trim().length > 0) {
      body["description"] = values.description.trim();
    }

    try {
      await confirm.mutateAsync({ id: receipt.id, body });
    } catch (error) {
      setError("root", {
        message: error instanceof ApiError ? error.message : "Gagal mengesahkan resit.",
      });
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="mt-4 space-y-3 border-t border-slate-100 pt-4"
      noValidate
    >
      <div>
        <label
          htmlFor={`category-${receipt.id}`}
          className="block text-sm font-medium text-slate-700"
        >
          Kategori
        </label>
        <select id={`category-${receipt.id}`} {...register("categoryId")} className={fieldClass}>
          <option value="">Pilih kategori</option>
          <optgroup label="Perbelanjaan">
            {expense.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Pendapatan">
            {income.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        </select>
        {errors.categoryId && (
          <p className="mt-1 text-sm text-red-600">{errors.categoryId.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`amount-${receipt.id}`}
            className="block text-sm font-medium text-slate-700"
          >
            Jumlah (RM)
          </label>
          <input
            id={`amount-${receipt.id}`}
            type="text"
            inputMode="decimal"
            {...register("amount")}
            className={fieldClass}
          />
          {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>}
        </div>
        <div>
          <label
            htmlFor={`date-${receipt.id}`}
            className="block text-sm font-medium text-slate-700"
          >
            Tarikh
          </label>
          <input
            id={`date-${receipt.id}`}
            type="date"
            {...register("occurredOn")}
            className={fieldClass}
          />
          {errors.occurredOn && (
            <p className="mt-1 text-sm text-red-600">{errors.occurredOn.message}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`desc-${receipt.id}`} className="block text-sm font-medium text-slate-700">
          Keterangan
        </label>
        <input
          id={`desc-${receipt.id}`}
          type="text"
          {...register("description")}
          className={fieldClass}
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

      <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
        {isSubmitting ? "Mengesahkan…" : "Sahkan jadi transaksi"}
      </button>
    </form>
  );
}

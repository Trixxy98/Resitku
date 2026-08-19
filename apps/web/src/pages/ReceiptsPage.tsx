import { zodResolver } from "@hookform/resolvers/zod";
import { formatAmount, isoDateSchema, toDecimalString } from "@resitku/shared";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ReceiptUploadForm } from "../components/ReceiptUploadForm";
import { useCategoriesQuery } from "../hooks/useCategories";
import { useConfirmReceipt, useReceiptsQuery } from "../hooks/useReceipts";
import { ApiError } from "../lib/apiClient";
import {
  cardClass,
  errorClass,
  fieldClass,
  labelClass,
  mutedClass,
  pageClass,
  primaryButtonClass,
} from "../lib/formStyles";
import type { CategoryItem, ReceiptItem } from "../lib/types";

export function ReceiptsPage() {
  const receipts = useReceiptsQuery();
  const categories = useCategoriesQuery();

  return (
    <div className={pageClass}>
      <h1 className="font-display text-3xl tracking-tight text-paper">Resit</h1>
      <p className={`mt-1 ${mutedClass}`}>
        Muat naik, tunggu bacaan, kemudian sahkan jadi transaksi.
      </p>

      <div className={`${cardClass} mt-6 p-5 sm:p-6`}>
        <ReceiptUploadForm />
      </div>

      <section className="mt-8 space-y-3">
        {receipts.isLoading && <p className={mutedClass}>Memuatkan…</p>}
        {receipts.isError && <p className={errorClass}>Gagal memuatkan resit.</p>}
        {receipts.data?.length === 0 && (
          <p className={`${cardClass} p-4 ${mutedClass}`}>Belum ada resit.</p>
        )}
        {receipts.data?.map((receipt) => (
          <ReceiptCard key={receipt.id} receipt={receipt} categories={categories.data ?? []} />
        ))}
      </section>
    </div>
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
    <article className={`${cardClass} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-paper">{receipt.parsedVendor ?? "Resit"}</p>
          <p className="text-xs text-mute">
            {new Date(receipt.createdAt).toLocaleString("ms-MY")} · {statusLabel(receipt.status)}
          </p>
        </div>
        {receipt.parsedAmountMinor !== null && (
          <p className="font-display text-lg text-paper">
            {formatAmount(receipt.parsedAmountMinor, receipt.parsedCurrency ?? "MYR")}
          </p>
        )}
      </div>

      {receipt.status === "PENDING" || receipt.status === "PROCESSING" ? (
        <p className={`mt-3 ${mutedClass}`}>Sedang dibaca… biarkan tab ini terbuka.</p>
      ) : null}

      {receipt.status === "FAILED" && receipt.errorMessage !== null ? (
        <p className={`mt-3 ${errorClass}`}>{receipt.errorMessage}</p>
      ) : null}

      {receipt.transactionId !== null ? (
        <p className="mt-3 text-sm text-mint">Sudah disahkan sebagai transaksi.</p>
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
      className="mt-4 space-y-3 border-t border-line pt-4"
      noValidate
    >
      <div>
        <label
          htmlFor={`category-${receipt.id}`}
          className={labelClass}
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
          <p className={`mt-1 ${errorClass}`}>{errors.categoryId.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`amount-${receipt.id}`}
            className={labelClass}
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
          {errors.amount && <p className={`mt-1 ${errorClass}`}>{errors.amount.message}</p>}
        </div>
        <div>
          <label
            htmlFor={`date-${receipt.id}`}
            className={labelClass}
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
            <p className={`mt-1 ${errorClass}`}>{errors.occurredOn.message}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`desc-${receipt.id}`} className={labelClass}>
          Keterangan
        </label>
        <input
          id={`desc-${receipt.id}`}
          type="text"
          {...register("description")}
          className={fieldClass}
        />
        {errors.description && (
          <p className={`mt-1 ${errorClass}`}>{errors.description.message}</p>
        )}
      </div>

      {errors.root && <p className={errorClass}>{errors.root.message}</p>}

      <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
        {isSubmitting ? "Mengesahkan…" : "Sahkan jadi transaksi"}
      </button>
    </form>
  );
}

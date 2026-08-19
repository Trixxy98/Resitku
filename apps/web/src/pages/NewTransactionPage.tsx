import { zodResolver } from "@hookform/resolvers/zod";
import { isoDateSchema } from "@resitku/shared";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useCategoriesQuery } from "../hooks/useCategories";
import { useCreateTransaction } from "../hooks/useTransactions";
import { ApiError } from "../lib/apiClient";
import { todayLocalIsoDate } from "../lib/dates";
import {
  cardClass,
  errorClass,
  fieldClass,
  labelClass,
  mutedClass,
  pageClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../lib/formStyles";

/// Skema borang, bukan createTransactionSchema. Skema API menukar jumlah
/// kepada unit sen; kalau resolver buat kerja itu, handleSubmit hantar 1250
/// (sen) dan API menukarnya sekali lagi kepada RM 1,250.00.
const transactionFormSchema = z.object({
  categoryId: z.uuid("Pilih kategori"),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, "Jumlah mesti nombor positif, maksimum 2 perpuluhan")
    .refine((value) => Number(value) > 0, "Jumlah mesti lebih daripada sifar"),
  description: z.string().trim().max(280),
  occurredOn: isoDateSchema,
});

type FormValues = z.infer<typeof transactionFormSchema>;

export function NewTransactionPage() {
  const navigate = useNavigate();
  const categories = useCategoriesQuery();
  const createTransaction = useCreateTransaction();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      categoryId: "",
      amount: "",
      description: "",
      occurredOn: todayLocalIsoDate(),
    },
  });

  async function onSubmit(values: FormValues): Promise<void> {
    try {
      await createTransaction.mutateAsync({
        categoryId: values.categoryId,
        amount: values.amount,
        occurredOn: values.occurredOn,
        ...(values.description.length > 0 ? { description: values.description } : {}),
      });
      void navigate("/", { replace: true });
    } catch (error) {
      setError("root", {
        message: error instanceof ApiError ? error.message : "Gagal menyimpan transaksi.",
      });
    }
  }

  const income = (categories.data ?? []).filter((category) => category.type === "INCOME");
  const expense = (categories.data ?? []).filter((category) => category.type === "EXPENSE");

  return (
    <div className={pageClass}>
      <h1 className="font-display text-3xl tracking-tight text-paper">Tambah transaksi</h1>
      <p className={`mt-1 ${mutedClass}`}>
        Isi manual bila tiada resit. Lebih pantas:{" "}
        <Link to="/receipts" className="text-amber underline">
          snap resit
        </Link>
        .
      </p>

      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className={`${cardClass} mt-6 max-w-md space-y-4 p-6`}
        noValidate
      >
        <div>
          <label htmlFor="categoryId" className={labelClass}>
            Kategori
          </label>
          <select id="categoryId" {...register("categoryId")} className={fieldClass}>
            <option value="">Pilih kategori</option>
            <optgroup label="Pendapatan">
              {income.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Perbelanjaan">
              {expense.map((category) => (
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

        <div>
          <label htmlFor="amount" className={labelClass}>
            Jumlah (RM)
          </label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="12.50"
            {...register("amount")}
            className={fieldClass}
          />
          {errors.amount && <p className={`mt-1 ${errorClass}`}>{errors.amount.message}</p>}
        </div>

        <div>
          <label htmlFor="occurredOn" className={labelClass}>
            Tarikh
          </label>
          <input id="occurredOn" type="date" {...register("occurredOn")} className={fieldClass} />
          {errors.occurredOn && (
            <p className={`mt-1 ${errorClass}`}>{errors.occurredOn.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Keterangan <span className="font-normal text-mute">(pilihan)</span>
          </label>
          <input id="description" type="text" {...register("description")} className={fieldClass} />
          {errors.description && (
            <p className={`mt-1 ${errorClass}`}>{errors.description.message}</p>
          )}
        </div>

        {errors.root && <p className={errorClass}>{errors.root.message}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? "Menyimpan…" : "Simpan"}
          </button>
          <Link to="/" className={`${secondaryButtonClass} inline-flex items-center`}>
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}

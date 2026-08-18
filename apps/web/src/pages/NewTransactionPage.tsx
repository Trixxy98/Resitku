import { zodResolver } from "@hookform/resolvers/zod";
import { isoDateSchema } from "@resitku/shared";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useCategoriesQuery } from "../hooks/useCategories";
import { useCreateTransaction } from "../hooks/useTransactions";
import { ApiError } from "../lib/apiClient";
import { todayLocalIsoDate } from "../lib/dates";
import { fieldClass, primaryButtonClass, secondaryButtonClass } from "../lib/formStyles";

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Tambah transaksi</h1>
      <p className="mt-1 text-sm text-slate-500">
        Rekod pendapatan atau perbelanjaan secara manual. Untuk resit, guna{" "}
        <Link to="/receipts" className="underline">
          muat naik resit
        </Link>
        .
      </p>

      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="mt-6 max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        noValidate
      >
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium text-slate-700">
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
            <p className="mt-1 text-sm text-red-600">{errors.categoryId.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-slate-700">
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
          {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>}
        </div>

        <div>
          <label htmlFor="occurredOn" className="block text-sm font-medium text-slate-700">
            Tarikh
          </label>
          <input id="occurredOn" type="date" {...register("occurredOn")} className={fieldClass} />
          {errors.occurredOn && (
            <p className="mt-1 text-sm text-red-600">{errors.occurredOn.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate-700">
            Keterangan <span className="font-normal text-slate-400">(pilihan)</span>
          </label>
          <input id="description" type="text" {...register("description")} className={fieldClass} />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
          )}
        </div>

        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

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

import { formatAmount } from "@resitku/shared";

import { useAuth } from "../context/AuthContext";
import { useSummaryQuery, useTransactionsQuery } from "../hooks/useTransactions";

export function DashboardPage() {
  const { user } = useAuth();
  const transactions = useTransactionsQuery();
  const summary = useSummaryQuery();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Selamat kembali, {user?.name}</h1>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Pendapatan bulan ini"
          value={summary.data?.totals.incomeMinor}
          tone="text-emerald-600"
        />
        <SummaryCard
          label="Perbelanjaan bulan ini"
          value={summary.data?.totals.expenseMinor}
          tone="text-red-600"
        />
        <SummaryCard
          label="Baki bersih"
          value={summary.data?.totals.netMinor}
          tone="text-slate-900"
        />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Transaksi terkini
        </h2>

        <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {transactions.isLoading && <p className="p-4 text-sm text-slate-500">Memuatkan…</p>}
          {transactions.isError && (
            <p className="p-4 text-sm text-red-600">Gagal memuatkan transaksi.</p>
          )}
          {transactions.data?.items.length === 0 && (
            <p className="p-4 text-sm text-slate-500">Belum ada transaksi lagi.</p>
          )}
          {transactions.data?.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {item.description ?? item.category.name}
                </p>
                <p className="text-xs text-slate-500">
                  {item.category.name} · {item.occurredOn}
                </p>
              </div>
              <p
                className={
                  item.direction === "INCOME"
                    ? "text-sm font-semibold text-emerald-600"
                    : "text-sm font-semibold text-red-600"
                }
              >
                {item.direction === "INCOME" ? "+" : "-"}
                {formatAmount(item.amountMinor, item.currency)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone}`}>
        {value === undefined ? "…" : formatAmount(value)}
      </p>
    </div>
  );
}

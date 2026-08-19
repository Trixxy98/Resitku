import { formatAmount } from "@resitku/shared";
import { Link, useNavigate } from "react-router-dom";

import { ReceiptUploadForm } from "../components/ReceiptUploadForm";
import { useAuth } from "../context/AuthContext";
import { useReceiptsQuery } from "../hooks/useReceipts";
import { useSummaryQuery, useTransactionsQuery } from "../hooks/useTransactions";
import { cardClass, mutedClass, pageClass, secondaryButtonClass } from "../lib/formStyles";

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const transactions = useTransactionsQuery();
  const summary = useSummaryQuery();
  const receipts = useReceiptsQuery();

  const monthLabel = new Intl.DateTimeFormat("ms-MY", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  const awaitingConfirm =
    receipts.data?.filter(
      (receipt) =>
        (receipt.status === "PARSED" || receipt.status === "FAILED") &&
        receipt.transactionId === null,
    ).length ?? 0;

  return (
    <div className={pageClass}>
      <p className="text-sm text-mute">Selamat kembali</p>
      <h1 className="font-display text-3xl tracking-tight text-paper sm:text-4xl">{user?.name}</h1>

      <section className={`${cardClass} mt-8 p-5 sm:p-6`}>
        <ReceiptUploadForm onUploaded={() => void navigate("/receipts")} />
        <p className={`mt-4 ${mutedClass}`}>
          Tiada resit?{" "}
          <Link to="/transactions/new" className="font-medium text-amber hover:underline">
            Isi transaksi manual
          </Link>
        </p>
      </section>

      {awaitingConfirm > 0 && (
        <Link
          to="/receipts"
          className="mt-4 flex items-center justify-between rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber hover:bg-amber/15"
        >
          <span>
            {awaitingConfirm} resit menunggu pengesahan
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <article className={`${cardClass} p-5 sm:col-span-3`}>
          <p className="text-xs font-medium tracking-[0.18em] text-mute uppercase">
            Baki bersih · {monthLabel}
          </p>
          <p className="font-display mt-2 text-4xl tracking-tight text-paper sm:text-5xl">
            {summary.data === undefined ? "…" : formatAmount(summary.data.totals.netMinor)}
          </p>
        </article>
        <SummaryCard
          label="Pendapatan"
          value={summary.data?.totals.incomeMinor}
          tone="text-mint"
        />
        <SummaryCard
          label="Perbelanjaan"
          value={summary.data?.totals.expenseMinor}
          tone="text-rose"
        />
        <Link
          to="/receipts"
          className={`${cardClass} flex flex-col justify-center p-5 hover:border-amber/40`}
        >
          <p className="text-xs font-medium tracking-[0.18em] text-mute uppercase">Resit</p>
          <p className="mt-2 text-lg font-semibold text-paper">Lihat semua</p>
        </Link>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xs font-medium tracking-[0.18em] text-mute uppercase">
            Transaksi terkini
          </h2>
          <Link to="/transactions/new" className={`${secondaryButtonClass} py-1.5 text-xs`}>
            Manual
          </Link>
        </div>

        <div className={`${cardClass} mt-3 divide-y divide-line`}>
          {transactions.isLoading && <p className={`p-4 ${mutedClass}`}>Memuatkan…</p>}
          {transactions.isError && <p className="p-4 text-sm text-rose">Gagal memuatkan transaksi.</p>}
          {transactions.data?.items.length === 0 && (
            <p className={`p-4 ${mutedClass}`}>
              Belum ada transaksi. Snap resit di atas, atau{" "}
              <Link to="/transactions/new" className="text-amber underline">
                isi manual
              </Link>
              .
            </p>
          )}
          {transactions.data?.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-paper">
                  {item.description ?? item.category.name}
                </p>
                <p className="text-xs text-mute">
                  {item.category.name} · {item.occurredOn}
                </p>
              </div>
              <p
                className={
                  item.direction === "INCOME"
                    ? "font-display text-lg text-mint"
                    : "font-display text-lg text-rose"
                }
              >
                {item.direction === "INCOME" ? "+" : "−"}
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
    <div className={`${cardClass} p-5`}>
      <p className="text-xs font-medium tracking-[0.18em] text-mute uppercase">{label}</p>
      <p className={`font-display mt-2 text-2xl tracking-tight ${tone}`}>
        {value === undefined ? "…" : formatAmount(value)}
      </p>
    </div>
  );
}

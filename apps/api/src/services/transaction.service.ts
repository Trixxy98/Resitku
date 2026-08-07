import type {
  CategoryType,
  CreateTransactionInput,
  ListTransactionsQuery,
  SummaryQuery,
  TransactionDirection,
  TransactionStatus,
  UpdateTransactionInput,
} from "@resitku/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export interface TransactionView {
  id: string;
  direction: TransactionDirection;
  /// Sen, bukan ringgit. Klien memformatnya dengan formatAmount daripada
  /// packages/shared, supaya tiada tempat dalam sistem ini yang perlu
  /// membahagikan wang dengan 100 sendiri.
  amountMinor: number;
  currency: string;
  description: string | null;
  occurredOn: string;
  status: TransactionStatus;
  category: { id: string; name: string; type: CategoryType };
  createdAt: string;
  updatedAt: string;
}

export interface TransactionPage {
  items: TransactionView[];
  nextCursor: string | null;
}

const TRANSACTION_SELECT = {
  id: true,
  direction: true,
  amountMinor: true,
  currency: true,
  description: true,
  occurredOn: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, type: true } },
} satisfies Prisma.TransactionSelect;

type TransactionRow = Prisma.TransactionGetPayload<{ select: typeof TRANSACTION_SELECT }>;

/// Lajur DATE dalam Postgres tiada masa mahupun zon. Prisma memulangkannya
/// sebagai tengah malam UTC, jadi menghiris rentetan ISO memberikan hari yang
/// benar-benar disimpan. Membiarkan objek Date itu sampai ke JSON akan
/// menganjakkan harinya bagi mana-mana klien di sebelah barat UTC.
function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toView(row: TransactionRow): TransactionView {
  return {
    ...row,
    occurredOn: toDateString(row.occurredOn),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/// Kategori yang dirujuk mesti milik pemanggil. Tanpa semakan ini, sesiapa yang
/// meneka satu uuid boleh memfailkan perbelanjaannya di bawah kategori orang
/// lain, dan ringkasan mangsa nanti mengandungi baris yang bukan miliknya.
async function requireOwnedCategory(
  userId: string,
  categoryId: string,
): Promise<{ id: string; type: CategoryType }> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, type: true },
  });

  if (category === null) {
    throw HttpError.badRequest("Category does not exist");
  }

  return category;
}

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<TransactionView> {
  const category = await requireOwnedCategory(userId, input.categoryId);

  const row = await prisma.transaction.create({
    data: {
      userId,
      categoryId: category.id,
      // Disalin, bukan dirujuk. Mengklasifikasikan semula kategori pada masa
      // hadapan tidak boleh menulis semula apa yang sudah berlaku.
      direction: category.type,
      // amountSchema sudah menukarkannya kepada unit minor semasa parse.
      amountMinor: input.amount,
      currency: input.currency,
      description: input.description,
      occurredOn: new Date(input.occurredOn),
    },
    select: TRANSACTION_SELECT,
  });

  return toView(row);
}

export async function getTransaction(userId: string, id: string): Promise<TransactionView> {
  // findFirst dengan userId di dalam where, bukan findUnique diikuti semakan
  // selepasnya. Baris milik orang lain tidak pernah meninggalkan database, dan
  // id yang wujud di akaun lain tidak dapat dibezakan daripada id yang tiada.
  const row = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
    select: TRANSACTION_SELECT,
  });

  if (row === null) {
    throw HttpError.notFound("Transaction not found");
  }

  return toView(row);
}

export async function listTransactions(
  userId: string,
  query: ListTransactionsQuery,
): Promise<TransactionPage> {
  const where: Prisma.TransactionWhereInput = {
    userId,
    deletedAt: null,
    categoryId: query.categoryId,
    direction: query.direction,
    status: query.status,
  };

  if (query.from !== undefined || query.to !== undefined) {
    where.occurredOn = {
      gte: query.from === undefined ? undefined : new Date(query.from),
      lte: query.to === undefined ? undefined : new Date(query.to),
    };
  }

  const rows = await prisma.transaction.findMany({
    where,
    select: TRANSACTION_SELECT,
    // occurredOn sahaja bukan tertib menyeluruh kerana banyak transaksi
    // berkongsi hari yang sama. Id uuidv7 tersusun mengikut masa penciptaan,
    // jadi ia memutuskan seri secara deterministik dan keyset pagination tidak
    // boleh melangkau atau mengulang baris.
    orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
    // Satu lebih daripada yang diminta. Kalau baris tambahan itu pulang,
    // bermakna ada halaman seterusnya; ia dibuang dan tidak dihantar.
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
  });

  const items = rows.slice(0, query.limit).map(toView);

  return {
    items,
    nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
  };
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionView> {
  const data: Prisma.TransactionUncheckedUpdateManyInput = {};

  if (input.categoryId !== undefined) {
    const category = await requireOwnedCategory(userId, input.categoryId);

    data.categoryId = category.id;
    // Arah mengikut kategori. Tanpa baris ini, memindahkan transaksi daripada
    // Makanan ke Gaji akan meninggalkan satu perbelanjaan duduk di bawah
    // kategori pendapatan.
    data.direction = category.type;
  }

  if (input.amount !== undefined) {
    data.amountMinor = input.amount;
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  if (input.occurredOn !== undefined) {
    data.occurredOn = new Date(input.occurredOn);
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  // updateMany dan bukan update: update memerlukan where yang unik, jadi ia
  // hanya boleh menerima id. Menapis userId sebagai sebahagian daripada
  // tulisan itu sendiri adalah satu-satunya cara memastikan id yang diteka
  // daripada akaun lain tidak terkena.
  const { count } = await prisma.transaction.updateMany({
    where: { id, userId, deletedAt: null },
    data,
  });

  if (count === 0) {
    throw HttpError.notFound("Transaction not found");
  }

  return getTransaction(userId, id);
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  // Soft delete. Satu resit mungkin menunjuk ke baris ini, dan laporan yang
  // sudah dijalankan merujuknya; deletedAt mengekalkan kedua-duanya sambil
  // melenyapkan transaksi daripada setiap bacaan.
  const { count } = await prisma.transaction.updateMany({
    where: { id, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (count === 0) {
    throw HttpError.notFound("Transaction not found");
  }
}

export interface CategorySummaryLine {
  categoryId: string;
  name: string;
  type: CategoryType;
  direction: TransactionDirection;
  amountMinor: number;
}

export interface TransactionSummary {
  from: string;
  to: string;
  totals: { incomeMinor: number; expenseMinor: number; netMinor: number };
  byCategory: CategorySummaryLine[];
}

export async function getTransactionSummary(
  userId: string,
  query: SummaryQuery,
): Promise<TransactionSummary> {
  const groups = await prisma.transaction.groupBy({
    by: ["categoryId", "direction"],
    where: {
      userId,
      deletedAt: null,

      status: "CONFIRMED",
      occurredOn: { gte: new Date(query.from), lte: new Date(query.to) },
    },
    _sum: { amountMinor: true },
  });

  if (groups.length === 0) {
    return {
      from: query.from,
      to: query.to,
      totals: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
      byCategory: [],
    };
  }

  const categories = await prisma.category.findMany({
    where: { id: { in: groups.map((group) => group.categoryId) }, userId },
    select: { id: true, name: true, type: true },
  });

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const byCategory = groups
    .map((group) => {
      const category = categoryById.get(group.categoryId);

      if (category === undefined) {
        throw new Error(`Category ${group.categoryId} referenced by a transaction is missing`);
      }

      return {
        categoryId: group.categoryId,
        name: category.name,
        type: category.type,
        direction: group.direction,
        amountMinor: group._sum.amountMinor ?? 0,
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const totals = byCategory.reduce(
    (acc, line) => {
      if (line.direction === "INCOME") {
        acc.incomeMinor += line.amountMinor;
      } else {
        acc.expenseMinor += line.amountMinor;
      }

      return acc;
    },
    { incomeMinor: 0, expenseMinor: 0 },
  );

  return {
    from: query.from,
    to: query.to,
    totals: { ...totals, netMinor: totals.incomeMinor - totals.expenseMinor },
    byCategory,
  };
}

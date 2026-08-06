import type { CategoryType, CreateCategoryInput, UpdateCategoryInput } from "@resitku/shared";

import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export interface CategoryView {
  id: string;
  name: string;
  type: CategoryType;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_SELECT = {
  id: true,
  name: true,
  type: true,
  color: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_SELECT }>;

function toView(row: CategoryRow): CategoryView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function createCategory(
  userId: string,
  input: CreateCategoryInput,
): Promise<CategoryView> {
  try {
    const row = await prisma.category.create({
      data: { userId, name: input.name, type: input.type, color: input.color },
      select: CATEGORY_SELECT,
    });

    return toView(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw HttpError.conflict("A category with this name already exists");
    }

    throw error;
  }
}

export async function listCategories(userId: string): Promise<CategoryView[]> {
  const rows = await prisma.category.findMany({
    where: { userId },
    select: CATEGORY_SELECT,
    orderBy: { name: "asc" },
  });

  return rows.map(toView);
}

async function getCategory(userId: string, id: string): Promise<CategoryView> {
  const row = await prisma.category.findFirst({ where: { id, userId }, select: CATEGORY_SELECT });

  if (row === null) {
    throw HttpError.notFound("Category not found");
  }

  return toView(row);
}

export async function updateCategory(
  userId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryView> {
  try {
    const { count } = await prisma.category.updateMany({ where: { id, userId }, data: input });

    if (count === 0) {
      throw HttpError.notFound("Category not found");
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw HttpError.conflict("A category with this name already exists");
    }

    throw error;
  }

  return getCategory(userId, id);
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  try {
    // deleteMany and not delete for the same reason as everywhere else in this
    // codebase: delete demands a unique where, which cannot include userId.
    const { count } = await prisma.category.deleteMany({ where: { id, userId } });
    if (count === 0) {
      throw HttpError.notFound("Category not found");
    }
  } catch (error) {
    // The schema marks Transaction.category as onDelete: Restrict, so Postgres
    // itself refuses the delete rather than orphaning spending history. A
    // category with rows under it has to be recategorised first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw HttpError.conflict("Category has transactions and cannot be deleted");
    }
    throw error;
  }
}

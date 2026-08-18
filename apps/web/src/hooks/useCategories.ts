import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";
import type { CategoryItem } from "../lib/types";

export function useCategoriesQuery() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const body = await apiRequest<{ categories: CategoryItem[] }>("/api/categories");
      return body.categories;
    },
    enabled: user !== null,
  });
}

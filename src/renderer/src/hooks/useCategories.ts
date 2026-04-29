import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchCategoryItems } from "../api/halo";
import { useAuth } from "./useAuth";
import type { PaginatedResponse, CategoryItem } from "../types";

export function useCategoryList(apiPath: string, enabled = true) {
  const { isAuthenticated } = useAuth();

  return useInfiniteQuery<PaginatedResponse<CategoryItem>>({
    queryKey: ["category", apiPath],
    queryFn: ({ pageParam }) =>
      fetchCategoryItems(apiPath, {
        lastEvaluatedKey: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.last_evaluated_key?.id,
    enabled: enabled && isAuthenticated,
  });
}

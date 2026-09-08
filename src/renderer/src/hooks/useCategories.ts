import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchCategoryItems } from "../api/halo";
import { useAuth } from "./useAuth";
import type { ActorGender, PaginatedResponse, CategoryItem } from "../types";

export function useCategoryList(
  apiPath: string,
  enabled = true,
  filter = "",
  gender: ActorGender | null = null
) {
  const { isAuthenticated } = useAuth();
  // A gender change is a different paginated stream with its own cursor, so it
  // belongs in the key. Normalised so `undefined` and `null` are one entry.
  const genderKey = gender ?? null;

  return useInfiniteQuery<PaginatedResponse<CategoryItem>>({
    queryKey: ["category", apiPath, filter, genderKey],
    queryFn: ({ pageParam }) =>
      fetchCategoryItems(apiPath, {
        lastEvaluatedKey: pageParam as string | undefined,
        filter,
        gender: genderKey,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.last_evaluated_key?.id,
    enabled: enabled && isAuthenticated,
  });
}

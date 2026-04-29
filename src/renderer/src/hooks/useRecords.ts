import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchCategoryRecords, fetchRandomRecords, fetchUserRecords } from "../api/halo";
import { useAuth } from "./useAuth";
import type { PaginatedResponse, ContentRecord } from "../types";

// Hardcoded app user ID (matches the iOS app)
const APP_USER_ID = "16f158d83507b0c86eeb";

export function useCategoryRecords(
  apiPath: string,
  id: string,
  enabled = true
) {
  const { isAuthenticated } = useAuth();

  return useInfiniteQuery<PaginatedResponse<ContentRecord>>({
    queryKey: ["records", apiPath, id],
    queryFn: ({ pageParam }) =>
      fetchCategoryRecords(apiPath, id, {
        lastEvaluatedKey: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.last_evaluated_key?.id,
    enabled: enabled && isAuthenticated && !!id,
  });
}

export function useUserRecords() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["userRecords", APP_USER_ID],
    queryFn: () =>
      fetchUserRecords(APP_USER_ID, { limit: 100 }),
    enabled: isAuthenticated,
  });
}

export function useRandomRecords() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["randomRecords"],
    queryFn: fetchRandomRecords,
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

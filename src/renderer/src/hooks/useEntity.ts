import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { fetchEntity } from "../api/halo";
import { useAuth } from "./useAuth";

function entityQuery(entityType: string, id: string, enabled: boolean) {
  return queryOptions({
    queryKey: ["entity", entityType, id],
    queryFn: () => fetchEntity(entityType, id),
    enabled: enabled && !!entityType && !!id,
  });
}

export function useEntity(entityType: string, id: string, enabled = true) {
  const { isAuthenticated } = useAuth();

  return useQuery(entityQuery(entityType, id, enabled && isAuthenticated));
}

export function useEntities(entityType: string, ids: string[]) {
  const { isAuthenticated } = useAuth();

  return useQueries({
    queries: ids.map((id) => entityQuery(entityType, id, isAuthenticated)),
  });
}

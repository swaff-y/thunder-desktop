import { useQuery } from "@tanstack/react-query";
import { fetchEntity } from "../api/halo";
import { useAuth } from "./useAuth";

export function useEntity(entityType: string, id: string, enabled = true) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["entity", entityType, id],
    queryFn: () => fetchEntity(entityType, id),
    enabled: enabled && isAuthenticated && !!entityType && !!id,
  });
}

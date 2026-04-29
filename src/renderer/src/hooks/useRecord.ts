import { useQuery } from "@tanstack/react-query";
import { fetchRecord } from "../api/halo";
import { useAuth } from "./useAuth";

export function useRecord(recordId: string, enabled = true) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["record", recordId],
    queryFn: () => fetchRecord(recordId),
    enabled: enabled && isAuthenticated && !!recordId,
  });
}

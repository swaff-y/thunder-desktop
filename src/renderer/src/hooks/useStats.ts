import { useQuery } from "@tanstack/react-query";
import {
  fetchTopEntities,
  fetchPlatformActivity,
  fetchTrending,
  fetchSummaryTimeline,
  fetchEntityTimeline,
  fetchCtr,
} from "../api/halo";
import { useAuth } from "./useAuth";
import type { StatsEntityType, StatsEventType, StatsGranularity } from "../types";

export function useTopEntities(entityType: StatsEntityType, limit?: number) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["stats", "top", entityType, limit],
    queryFn: () => fetchTopEntities(entityType, limit),
    enabled: isAuthenticated,
  });
}

export function usePlatformActivity(startDate: string, endDate: string, granularity?: StatsGranularity) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["stats", "platform", startDate, endDate, granularity],
    queryFn: () => fetchPlatformActivity({ startDate, endDate, granularity }),
    enabled: isAuthenticated,
  });
}

export function useTrending(entityType: StatsEntityType) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["stats", "trending", entityType],
    queryFn: () => fetchTrending(entityType),
    enabled: isAuthenticated,
  });
}

export function useSummaryTimeline(
  entityType: StatsEntityType,
  eventType: StatsEventType,
  startDate: string,
  endDate: string,
  granularity?: StatsGranularity,
) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["stats", "summary", entityType, eventType, startDate, endDate, granularity],
    queryFn: () => fetchSummaryTimeline({ entityType, eventType, startDate, endDate, granularity }),
    enabled: isAuthenticated,
  });
}

export function useEntityTimeline(
  entityType: StatsEntityType,
  entityId: string,
  startDate: string,
  endDate: string,
  granularity?: StatsGranularity,
) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["stats", "timeline", entityType, entityId, startDate, endDate, granularity],
    queryFn: () => fetchEntityTimeline({ entityType, entityId, startDate, endDate, granularity }),
    enabled: isAuthenticated && !!entityId,
  });
}

export function useCtr(
  entityType: StatsEntityType,
  entityId: string,
  startDate: string,
  endDate: string,
  granularity?: StatsGranularity,
) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["stats", "ctr", entityType, entityId, startDate, endDate, granularity],
    queryFn: () => fetchCtr({ entityType, entityId, startDate, endDate, granularity }),
    enabled: isAuthenticated && !!entityId,
  });
}

import client, { getAuthHeaders, getCachedCreds } from "./client";
import type {
  PaginatedResponse,
  CategoryItem,
  ContentRecord,
  LoginResponse,
  RecordPatchBody,
  StatsEntityType,
  StatsGranularity,
  StatsEventType,
  TopEntitiesData,
  PlatformData,
  TrendingData,
  SummaryData,
  TimelineData,
  CtrData,
} from "../types";
import { API_URL } from "../config/env";

interface PaginationParams {
  lastEvaluatedKey?: string | null;
  limit?: number;
}

function buildListUrl(
  basePath: string,
  { lastEvaluatedKey, limit = 50 }: PaginationParams
): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (lastEvaluatedKey) params.set("start_key", lastEvaluatedKey);
  return `${basePath}?${params}`;
}

// Category list fetchers
export function fetchActors(params: PaginationParams) {
  return client
    .get<PaginatedResponse<CategoryItem>>(buildListUrl("v1/actor", params))
    .then((r) => r.data);
}

export function fetchSeries(params: PaginationParams) {
  return client
    .get<PaginatedResponse<CategoryItem>>(buildListUrl("v1/series", params))
    .then((r) => r.data);
}

export function fetchMovies(params: PaginationParams) {
  return client
    .get<PaginatedResponse<CategoryItem>>(buildListUrl("v1/movie", params))
    .then((r) => r.data);
}

export function fetchTags(params: PaginationParams) {
  return client
    .get<PaginatedResponse<CategoryItem>>(buildListUrl("v1/tag", params))
    .then((r) => r.data);
}

// Category record fetchers
export function fetchActorRecords(
  actorId: string,
  params: PaginationParams
) {
  return client
    .get<PaginatedResponse<ContentRecord>>(
      buildListUrl(`v1/actor/${actorId}/records`, { ...params, limit: params.limit ?? 50 })
    )
    .then((r) => r.data);
}

export function fetchSeriesRecords(
  seriesId: string,
  params: PaginationParams
) {
  return client
    .get<PaginatedResponse<ContentRecord>>(
      buildListUrl(`v1/series/${seriesId}/records`, { ...params, limit: params.limit ?? 50 })
    )
    .then((r) => r.data);
}

export function fetchMovieRecords(
  movieId: string,
  params: PaginationParams
) {
  return client
    .get<PaginatedResponse<ContentRecord>>(
      buildListUrl(`v1/movie/${movieId}/records`, { ...params, limit: params.limit ?? 50 })
    )
    .then((r) => r.data);
}

export function fetchTagRecords(
  tagId: string,
  params: PaginationParams
) {
  return client
    .get<PaginatedResponse<ContentRecord>>(
      buildListUrl(`v1/tag/${tagId}/records`, { ...params, limit: params.limit ?? 50 })
    )
    .then((r) => r.data);
}

export function fetchUserRecords(
  userId: string,
  params: PaginationParams
) {
  return client
    .get<PaginatedResponse<ContentRecord>>(
      buildListUrl(`v1/user/${userId}/records`, { ...params, limit: params.limit ?? 50 })
    )
    .then((r) => r.data);
}

export function fetchRandomRecords() {
  return client
    .get<PaginatedResponse<ContentRecord>>("v1/record/random")
    .then((r) => r.data);
}

// Single record
export function fetchRecord(recordId: string) {
  return client.get<{ data: ContentRecord }>(`v1/record/${recordId}`).then((r) => r.data.data);
}

// Video proxy URL builder
export function getProxyUrl(recordId: string): string {
  return `${API_URL}v1/proxy/${recordId}`;
}

// Authenticated video URL — appends stored tokens as query params
export function buildAuthProxyUrl(recordId: string): string {
  const base = getProxyUrl(recordId);
  const creds = getCachedCreds();
  const token = creds?.token ?? "";
  const apiKey = creds?.apiKey ?? "";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}&api_key=${encodeURIComponent(apiKey)}`;
}

// Auth
export function login(email: string, password: string) {
  return client
    .post<LoginResponse>("v1/login", { email, password })
    .then((r) => r.data);
}

// Lookup map for generic category fetching
const categoryFetchers: Record<
  string,
  (params: PaginationParams) => Promise<PaginatedResponse<CategoryItem>>
> = {
  actor: fetchActors,
  series: fetchSeries,
  movie: fetchMovies,
  tag: fetchTags,
};

const recordFetchers: Record<
  string,
  (id: string, params: PaginationParams) => Promise<PaginatedResponse<ContentRecord>>
> = {
  actor: fetchActorRecords,
  series: fetchSeriesRecords,
  movie: fetchMovieRecords,
  tag: fetchTagRecords,
};

export function fetchCategoryItems(
  apiPath: string,
  params: PaginationParams
) {
  return categoryFetchers[apiPath](params);
}

export function fetchCategoryRecords(
  apiPath: string,
  id: string,
  params: PaginationParams
) {
  return recordFetchers[apiPath](id, params);
}

// Record actions
export function watchRecord(recordId: string) {
  return client.put<{ data: ContentRecord }>(`v1/record/${recordId}/watch`).then((r) => r.data.data);
}

export function likeRecord(recordId: string) {
  return client.put<{ data: ContentRecord }>(`v1/record/${recordId}/like`).then((r) => r.data.data);
}

export function updateRecord(recordId: string, body: RecordPatchBody) {
  return client.patch<{ data: ContentRecord }>(`v1/record/${recordId}`, body).then((r) => r.data.data);
}

// Click tracking (fire-and-forget, survives navigation)
export function trackEntityClick(entityType: string, entityId: string) {
  if (!entityId) return;
  fetch(`${API_URL}v1/${entityType}/${entityId}/click`, {
    method: "PUT",
    keepalive: true,
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  }).catch(() => {});
}

// Stats API
export function fetchTopEntities(entityType: StatsEntityType, limit?: number) {
  return client
    .get<{ data: TopEntitiesData }>("v1/stats/top", {
      params: { entity_type: entityType, limit },
    })
    .then((r) => r.data.data);
}

export function fetchPlatformActivity(params: {
  startDate: string;
  endDate: string;
  granularity?: StatsGranularity;
}) {
  return client
    .get<{ data: PlatformData }>("v1/stats/platform", {
      params: { start_date: params.startDate, end_date: params.endDate, granularity: params.granularity },
    })
    .then((r) => r.data.data);
}

export function fetchTrending(entityType: StatsEntityType) {
  return client
    .get<{ data: TrendingData }>("v1/stats/trending", {
      params: { entity_type: entityType },
    })
    .then((r) => r.data.data);
}

export function fetchSummaryTimeline(params: {
  entityType: StatsEntityType;
  eventType: StatsEventType;
  startDate: string;
  endDate: string;
  granularity?: StatsGranularity;
}) {
  return client
    .get<{ data: SummaryData }>("v1/stats/summary", {
      params: {
        entity_type: params.entityType,
        event_type: params.eventType,
        start_date: params.startDate,
        end_date: params.endDate,
        granularity: params.granularity,
      },
    })
    .then((r) => r.data.data);
}

export function fetchEntityTimeline(params: {
  entityType: StatsEntityType;
  entityId: string;
  startDate: string;
  endDate: string;
  granularity?: StatsGranularity;
}) {
  return client
    .get<{ data: TimelineData }>("v1/stats/timeline", {
      params: {
        entity_type: params.entityType,
        entity_id: params.entityId,
        start_date: params.startDate,
        end_date: params.endDate,
        granularity: params.granularity,
      },
    })
    .then((r) => r.data.data);
}

export function fetchCtr(params: {
  entityType: StatsEntityType;
  entityId: string;
  startDate: string;
  endDate: string;
  granularity?: StatsGranularity;
}) {
  return client
    .get<{ data: CtrData }>("v1/stats/ctr", {
      params: {
        entity_type: params.entityType,
        entity_id: params.entityId,
        start_date: params.startDate,
        end_date: params.endDate,
        granularity: params.granularity,
      },
    })
    .then((r) => r.data.data);
}

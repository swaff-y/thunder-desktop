export interface CategoryItem {
  id: string;
  name: string;
  description: string;
  url: string;
  imageKey?: string;
  imageVersion?: number | string;
  status: "processing" | "processed";
}

export interface RecordImage {
  url: string;
  imageKey?: string;
  imageVersion?: number | string;
}

export interface RecordRef {
  id: string;
  name: string;
}

export interface ContentRecord {
  id: string;
  name: string;
  series?: RecordRef;
  movie?: RecordRef;
  actors: RecordRef[];
  tags: RecordRef[];
  images: RecordImage[];
  likes?: number | null;
  views?: number | null;
}

export type RecordRefInput = RecordRef | { name: string };

export interface RecordPatchBody {
  name: string;
  series?: RecordRefInput | null;
  movie?: RecordRefInput | null;
  actors?: RecordRefInput[];
  tags?: RecordRefInput[];
}

export interface PaginationMeta {
  last_evaluated_key?: { id: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface LoginResponse {
  statusCode: number;
  data: {
    access_token: string;
    api_key: string;
  };
}

export type CategoryType = "actors" | "series" | "movies" | "tags";

export interface CategoryConfig {
  type: CategoryType;
  label: string;
  apiPath: string;
  idParam: string;
  filterable: boolean;
}

export const CATEGORIES: CategoryConfig[] = [
  { type: "actors", label: "Actors", apiPath: "actor", idParam: "actor_id", filterable: true },
  { type: "series", label: "Series", apiPath: "series", idParam: "series_id", filterable: true },
  { type: "movies", label: "Movies", apiPath: "movie", idParam: "movie_id", filterable: true },
  { type: "tags", label: "Tags", apiPath: "tag", idParam: "tag_id", filterable: true },
];

export function getCategoryConfig(
  type: string | undefined
): CategoryConfig | undefined {
  return CATEGORIES.find((c) => c.type === type);
}

// Stats types
export type StatsEntityType = "tag" | "record" | "actor" | "series" | "movie";
export type StatsGranularity = "day" | "week" | "month";
export type StatsEventType = "click" | "view";

export interface TopEntityItem {
  entity_id: string;
  name: string;
  count: number;
}

export interface TopEntitiesData {
  entity_type: StatsEntityType;
  event_type: StatsEventType;
  items: TopEntityItem[];
}

export interface PlatformPoint {
  date: string;
  total_clicks: number;
  total_views: number;
}

export interface PlatformData {
  granularity: StatsGranularity;
  data: PlatformPoint[];
}

export interface TrendingItem {
  entity_id: string;
  name: string;
  this_week: number;
  last_week: number;
  growth_pct: number;
}

export interface TrendingData {
  entity_type: StatsEntityType;
  event_type: StatsEventType;
  period: string;
  items: TrendingItem[];
}

export interface SummaryPoint {
  date?: string;
  period?: string;
  count: number;
}

export interface SummaryData {
  entity_type: StatsEntityType;
  event_type: StatsEventType;
  granularity: StatsGranularity;
  data: SummaryPoint[];
}

export interface TimelinePoint {
  date?: string;
  period?: string;
  count: number;
}

export interface TimelineData {
  entity_type: StatsEntityType;
  entity_id: string;
  name: string;
  event_type: StatsEventType;
  granularity: StatsGranularity;
  data: TimelinePoint[];
}

export interface CtrPoint {
  date: string;
  clicks: number;
  record_views: number;
  ctr: number;
}

export interface CtrData {
  entity_type: StatsEntityType;
  entity_id: string;
  name: string;
  period: string;
  total_clicks: number;
  total_record_views: number;
  ctr: number;
  data: CtrPoint[];
}

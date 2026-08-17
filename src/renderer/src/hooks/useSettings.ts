import { useQuery } from "@tanstack/react-query";

export const CHAT_ENABLED_KEY = ["settings", "chatEnabled"] as const;

/**
 * TD-056: read fresh on each mount. The query cache is persisted to IDB,
 * so a cached read would outlive the toggle in Settings and leave the
 * panel hidden after the user turned it on — hence no staleTime, and no
 * gcTime to persist.
 */
export function useChatEnabled(): boolean {
  const { data } = useQuery({
    queryKey: CHAT_ENABLED_KEY,
    queryFn: () => window.thunder.settings.get("chatEnabled"),
    staleTime: 0,
    gcTime: 0,
  });
  return data ?? false;
}

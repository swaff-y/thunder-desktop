import { useQuery } from "@tanstack/react-query";

export const CHAT_ENABLED_KEY = ["settings", "chatEnabled"] as const;

/**
 * TD-056: read once at mount. A settings change needs a restart to take
 * effect in main either way, so there is nothing here to subscribe to.
 */
export function useChatEnabled(): boolean {
  const { data } = useQuery({
    queryKey: CHAT_ENABLED_KEY,
    queryFn: () => window.thunder.settings.get("chatEnabled"),
    staleTime: Infinity,
  });
  return data ?? false;
}

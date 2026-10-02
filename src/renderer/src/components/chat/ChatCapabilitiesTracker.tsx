/**
 * TD-092: `ChatBridgeProvider` is mounted outside `AuthProvider`, so on a
 * launch that starts logged out the store's own capabilities fetch goes out
 * with no bearer and is refused — and `capabilities()` answers `null` for a
 * 401 exactly as it does for an unreachable service. TCC-017's retry covers a
 * token that is a moment late; a login is minutes late, and the store has no
 * way to know one happened. This leaf is the telling.
 *
 * It lives beside `ChatWriteTracker` rather than in the panel, for the same
 * reason: `ChatPanel` unmounts with the drawer, and the login it has to hear
 * about happens while the drawer is shut.
 */

import { useEffect } from "react";
import { useChat } from "@swaff-y/thunder-chat-core";
import { useAuth } from "../../hooks/useAuth";

export default function ChatCapabilitiesTracker(): null {
  const { isAuthenticated } = useAuth();
  const { greeting, refreshCapabilities } = useChat();

  /**
   * Only while there is nothing to overwrite. The server picks a greeting per
   * request, so refreshing one that already arrived would swap it under a
   * reader — which is the thing TCC-017 §2 stopped the store doing on its own,
   * and asking by hand does not make it better. A null greeting is the only
   * state this can improve, and a server that sends none simply makes this one
   * request per login and settles.
   */
  useEffect(() => {
    if (!isAuthenticated || greeting !== null) return;
    void refreshCapabilities();
  }, [isAuthenticated, greeting, refreshCapabilities]);

  return null;
}

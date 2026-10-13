import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../api/cache";
import type { ThunderBiometricStatus } from "../../../preload/thunder-api";

export const BIOMETRIC_STATUS_KEY = ["auth", "biometric", "status"] as const;

const UNSUPPORTED: ThunderBiometricStatus = {
  supported: false,
  remembered: false,
  reason: "platform",
};

/**
 * TD-094: what Touch ID can do on this machine, for the login screen and
 * for Settings. Read fresh on each mount and never persisted — the
 * answer changes the moment a password is remembered or forgotten, and a
 * cached one would leave an unlock button on a store that is empty.
 *
 * Falls back to unsupported when IPC is unavailable (vitest, dev
 * harness), which is also the correct answer for every non-darwin build.
 */
export function useBiometricStatus(): ThunderBiometricStatus {
  const { data } = useQuery({
    queryKey: BIOMETRIC_STATUS_KEY,
    queryFn: async () => (await window.thunder?.auth.biometric.status()) ?? UNSUPPORTED,
    staleTime: 0,
    gcTime: 0,
  });
  return data ?? UNSUPPORTED;
}

/**
 * Remember a login for Touch ID. The status re-read lives here rather
 * than at each call site so a caller cannot store a password and leave
 * the unlock button hidden.
 */
export async function storeLoginForTouchId(login: {
  email: string;
  password: string;
}): Promise<boolean> {
  const stored = (await window.thunder?.auth.biometric.remember(login)) ?? false;
  await refreshBiometricStatus();
  return stored;
}

export async function forgetTouchIdPassword(): Promise<void> {
  await window.thunder?.auth.biometric.forget();
  await refreshBiometricStatus();
}

/** For the one case main forgets the password itself: a refused replay. */
export async function refreshBiometricStatus(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: BIOMETRIC_STATUS_KEY });
}

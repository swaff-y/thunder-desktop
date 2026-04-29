// Stub — full AuthProvider/context lands in TD-009. Layout chrome only
// needs `logout` for the TopBar button to wire up.
export function useAuth(): { logout: () => void } {
  return { logout: () => {} }
}

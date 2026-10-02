/**
 * TD-093: the message, never the object.
 *
 * An error on an auth path is usually an axios error, and an axios error
 * carries the request that failed — whose body, on the refresh and login
 * calls, *is* a credential. `console.error(error)` therefore writes a
 * 30-day refresh token (or the user's password, on the one migration
 * login) into the console and into anything that scrapes it. Every log
 * line on those paths names fields instead, and this is the field.
 *
 * Lives in `shared` rather than beside either caller because the rule has
 * to hold on both sides of the IPC boundary and a copy per process is how
 * it quietly stops holding.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

import { useState } from "react";
import { Button, Card } from "react-bootstrap";
import { useAuth } from "../../hooks/useAuth";

/**
 * TD-094: the launch gate's screen. Rendered in place of the router tree,
 * so nothing mounts behind it — no layout, no embedded browser, no
 * queries.
 *
 * It is a lock, not a credential: the session is on disk either way and
 * `safeStorage` is not biometric-bound, so this stops someone who picks
 * up an unlocked laptop and nothing more. The copy says so rather than
 * overstating it.
 */
export default function LaunchLock(): React.JSX.Element {
  const { unlockApp, logout } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleUnlock() {
    setBusy(true);
    try {
      // A dismissal clears nothing — the session is still there, and the
      // only thing that changes is the retry copy.
      setDismissed(!(await unlockApp()));
    } finally {
      setBusy(false);
    }
  }

  function handleSignOut() {
    void logout();
  }

  return (
    <main className="launch-lock">
      <Card className="launch-lock-card">
        <Card.Body>
          <h1 className="launch-lock-title">Thunder is locked</h1>
          <p className="launch-lock-copy">
            Touch ID guards this app on an unlocked laptop. It does not protect the stored
            session on disk.
          </p>

          <Button
            type="button"
            className="btn-cta w-100"
            onClick={handleUnlock}
            disabled={busy}
          >
            Unlock with Touch ID
          </Button>

          {dismissed && (
            <p className="launch-lock-retry" role="status">
              Touch ID was cancelled. Your session is still here — try again.
            </p>
          )}

          <Button variant="link" type="button" onClick={handleSignOut} className="w-100">
            Sign out instead
          </Button>
        </Card.Body>
      </Card>

      <style>{`
        .launch-lock {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: var(--space-md);
        }
        .launch-lock-card {
          width: 100%;
          max-width: 400px;
          padding: var(--space-sm);
        }
        .launch-lock-title {
          font-size: var(--text-title);
          font-weight: var(--weight-extrabold);
          margin: 0 0 var(--space-xs);
        }
        .launch-lock-copy,
        .launch-lock-retry {
          font-size: var(--text-body-sm);
          color: var(--color-text-muted);
        }
        .launch-lock-retry {
          margin: var(--space-sm) 0 0;
        }
      `}</style>
    </main>
  );
}

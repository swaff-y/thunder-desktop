import { useState } from "react";
import { Card, Form, Button, Alert } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  refreshBiometricStatus,
  storeLoginForTouchId,
  useBiometricStatus,
} from "../hooks/useBiometric";
import LoadingSpinner from "../components/shared/LoadingSpinner";

/**
 * TD-094: what the login screen says about a replay that didn't produce a
 * session. `cancelled` is deliberately absent — a dismissed prompt
 * returns to the form with nothing said.
 */
const UNLOCK_MESSAGES: Record<"rejected" | "transient" | "unavailable", string> = {
  rejected: "Your password has changed, so Touch ID is now off. Sign in below to set it up again.",
  transient: "Couldn't reach Halo just now. Try again in a moment.",
  unavailable: "Touch ID isn't available on this machine. Sign in below.",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [rememberForTouchId, setRememberForTouchId] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, loginWithBiometric } = useAuth();
  const biometric = useBiometricStatus();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password, staySignedIn);
      if (rememberForTouchId) {
        // Its own try: the user is signed in by this point, and a store
        // that refused to write is not a failed login.
        try {
          await storeLoginForTouchId({ email, password });
        } catch {
          // Nothing to say — Touch ID stays off and the session stands.
        }
      }
      navigate("/");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setError("");
    setLoading(true);
    const result = await loginWithBiometric();
    setLoading(false);

    if (result.ok) {
      navigate("/");
      return;
    }
    if (result.failure === "cancelled") return;
    if (result.failure === "rejected") {
      // Main has forgotten the password, so the button must go with it.
      await refreshBiometricStatus();
    }
    setError(UNLOCK_MESSAGES[result.failure]);
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="login-page">
      <div className="login-header">
        <h1 className="login-title">Thunder</h1>
        <p className="login-subtitle">Sign in to continue</p>
      </div>

      <Card className="login-card">
        <Card.Body>
          {biometric.remembered && (
            <div className="login-unlock">
              <Button type="button" className="btn-cta w-100" onClick={() => void handleUnlock()}>
                Unlock with Touch ID
              </Button>
              <p className="login-unlock-divider">or sign in with your password</p>
            </div>
          )}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Control
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Control
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                id="stay-signed-in"
                label="Stay signed in"
                checked={staySignedIn}
                onChange={(e) => setStaySignedIn(e.target.checked)}
              />
            </Form.Group>

            {biometric.supported && (
              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  id="remember-for-touch-id"
                  label="Remember my password for Touch ID"
                  checked={rememberForTouchId}
                  onChange={(e) => setRememberForTouchId(e.target.checked)}
                  aria-describedby="remember-for-touch-id-help"
                />
                <Form.Text id="remember-for-touch-id-help">
                  Keeps your password on this Mac, encrypted, so Touch ID can sign you in after
                  your session expires. A password lasts until you change it; a session expires
                  on its own.
                </Form.Text>
              </Form.Group>
            )}

            {error && <Alert className="login-error">{error}</Alert>}

            <Button type="submit" className="btn-cta w-100" disabled={!email || !password}>
              Login
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <style>{`
        .login-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: var(--space-md);
        }
        .login-header {
          text-align: center;
          margin-bottom: var(--space-lg);
        }
        .login-title {
          font-size: var(--text-hero);
          font-weight: var(--weight-extrabold);
          color: var(--color-accent);
          letter-spacing: var(--tracking-tight);
          margin: 0;
        }
        .login-subtitle {
          font-size: var(--text-body-sm);
          color: var(--color-text-muted);
          margin: var(--space-xs) 0 0;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          padding: var(--space-sm);
        }
        .login-unlock {
          margin-bottom: var(--space-md);
        }
        .login-unlock-divider {
          font-size: var(--text-body-sm);
          color: var(--color-text-muted);
          text-align: center;
          margin: var(--space-sm) 0 0;
        }
        .login-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--color-danger);
          color: var(--color-error-text);
          font-size: var(--text-body-sm);
          border-radius: var(--radius-sm);
        }
      `}</style>
    </div>
  );
}

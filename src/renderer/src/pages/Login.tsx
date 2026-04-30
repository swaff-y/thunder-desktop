import { useState } from "react";
import { Card, Form, Button, Alert } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import LoadingSpinner from "../components/shared/LoadingSpinner";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password, staySignedIn);
      navigate("/");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
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

            {error && (
              <Alert className="login-error">{error}</Alert>
            )}

            <Button
              type="submit"
              className="btn-cta w-100"
              disabled={!email || !password}
            >
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

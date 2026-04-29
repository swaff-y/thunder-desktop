import { Button, Card } from "react-bootstrap";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state">
      <Card className="error-card">
        <Card.Body>
          <h3 className="error-title">Error</h3>
          <p className="error-message">{message}</p>
          {onRetry && (
            <Button variant="success" onClick={onRetry}>
              Retry
            </Button>
          )}
        </Card.Body>
      </Card>

      <style>{`
        .error-state {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 40vh;
        }
        .error-card {
          max-width: 400px;
          text-align: center;
        }
        .error-title {
          color: var(--color-error-text);
          font-size: var(--text-h3);
          margin-bottom: var(--space-sm);
        }
        .error-message {
          color: var(--color-error-text);
          font-size: var(--text-body);
        }
      `}</style>
    </div>
  );
}

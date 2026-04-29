import { Spinner } from "react-bootstrap";

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  message?: string;
}

export default function LoadingSpinner({
  fullScreen = false,
  message,
}: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <div className="loading-fullscreen">
        <Spinner animation="border" />
        {message && <p className="loading-message">{message}</p>}

        <style>{`
          .loading-fullscreen {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: var(--space-md);
          }
          .loading-message {
            color: var(--color-text-muted);
            font-size: var(--text-body-sm);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="text-center py-3">
      <Spinner animation="border" size="sm" />
    </div>
  );
}

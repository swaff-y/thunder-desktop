import { IoArrowBack } from "react-icons/io5";

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

export default function BackButton({ onClick, label = "Back" }: BackButtonProps) {
  return (
    <>
      <button type="button" className="back-btn" onClick={onClick}>
        <IoArrowBack size={18} aria-hidden />
        <span>{label}</span>
      </button>

      <style>{`
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: var(--space-xs);
          padding: var(--space-xs) var(--space-sm);
          margin-bottom: var(--space-md);
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          font-size: var(--text-body);
          cursor: pointer;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .back-btn:hover {
          background: rgba(14, 165, 233, 0.08);
          color: var(--color-accent);
          border-color: var(--color-accent);
        }
      `}</style>
    </>
  );
}

import type { Nationality } from "../../types";
import { flagEmojiOf } from "../../utils/flagEmoji";

interface NationalityFlagProps {
  nationality: Nationality;
  className?: string;
}

export default function NationalityFlag({
  nationality,
  className,
}: NationalityFlagProps) {
  return (
    <>
      <span
        role="img"
        title={nationality.displayName}
        aria-label={nationality.displayName}
        className={className ? `nationality-flag ${className}` : "nationality-flag"}
      >
        {flagEmojiOf(nationality.code)}
      </span>
      <style>{`
        .nationality-flag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          font-size: 18px;
          line-height: 1;
          user-select: none;
        }
      `}</style>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { IoCopy, IoCheckmark } from "react-icons/io5";

const COPIED_MS = 1500;

interface CopyIdButtonProps {
  id: string;
  label?: string;
  className?: string;
}

export default function CopyIdButton({
  id,
  label = "Copy ID",
  className,
}: CopyIdButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current !== null) {
        window.clearTimeout(resetRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      return;
    }
    setCopied(true);
    if (resetRef.current !== null) {
      window.clearTimeout(resetRef.current);
    }
    resetRef.current = window.setTimeout(() => {
      setCopied(false);
      resetRef.current = null;
    }, COPIED_MS);
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          void handleCopy();
        }}
        aria-label={copied ? "Copied" : label}
        title={copied ? "Copied" : label}
      >
        {copied ? <IoCheckmark size={18} aria-hidden /> : <IoCopy size={18} aria-hidden />}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}

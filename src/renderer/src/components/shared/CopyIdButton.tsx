import { IoCopy, IoCheckmark } from "react-icons/io5";
import { useCopyId } from "../../hooks/useCopyId";

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
  const { copied, copy } = useCopyId(id);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={copy}
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

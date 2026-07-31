import type { ComponentType, MouseEvent } from "react";
import { useCall } from "@/context/CallContext";

interface CallIconButtonProps {
  contactId: number;
  contactName: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  className?: string;
}

/**
 * The little icon shown next to a person's name in call history, recent
 * calls, and notifications. Wherever it appears, clicking it calls that
 * person directly — like tapping a call-log entry on an actual phone.
 */
export function CallIconButton({
  contactId,
  contactName,
  icon: Icon,
  iconClassName = "w-4 h-4",
  className,
}: CallIconButtonProps) {
  const { startCall } = useCall();

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    startCall([{ id: contactId, name: contactName }]);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Call ${contactName}`}
      className={
        className ??
        "w-8 h-8 rounded-lg bg-[#0F172A] border border-[#334155]/60 flex items-center justify-center hover:border-[#06B6D4]/60 hover:bg-[#06B6D4]/10 transition-colors shrink-0"
      }
    >
      <Icon className={iconClassName} />
    </button>
  );
}

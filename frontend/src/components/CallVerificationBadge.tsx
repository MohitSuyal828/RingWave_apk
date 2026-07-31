import { useState } from "react";
import { ShieldCheck, ShieldQuestion, ShieldAlert, ChevronDown } from "lucide-react";
import type { VerificationStatus } from "@/hooks/useCallVerificationCode";

interface CallVerificationBadgeProps {
  status: VerificationStatus;
  code: string | null;
  peerName: string;
  className?: string;
}

/**
 * Shows the 16-digit call verification code (see hooks/useCallVerificationCode
 * + lib/crypto/verification.ts for how it's actually derived). Collapsed by
 * default — this is a "check if you want proof" affordance, not something
 * that needs to interrupt every call, mirroring how WhatsApp's safety
 * number lives a tap away rather than being shown unprompted on every
 * chat.
 */
export function CallVerificationBadge({
  status,
  code,
  peerName,
  className = "",
}: CallVerificationBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (status === "idle" || status === "computing") {
    return null; // nothing meaningful to show yet — avoid a flash of "unverified"-looking UI on every call start
  }

  const isReady = status === "ready" && code;

  return (
    <div className={`w-full max-w-sm ${className}`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`w-full flex items-center gap-2 px-4 py-2 rounded-xl border text-xs transition-colors ${
          isReady
            ? "bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E]/15"
            : status === "contact-has-no-key"
            ? "bg-[#94A3B8]/10 border-[#334155]/60 text-[#94A3B8] hover:text-[#F8FAFC]"
            : "bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B] hover:bg-[#F59E0B]/15"
        }`}
      >
        {isReady ? (
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        ) : status === "contact-has-no-key" ? (
          <ShieldQuestion className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="flex-1 text-left">
          {isReady
            ? "Call verification code available"
            : status === "contact-has-no-key"
            ? `${peerName} hasn't set up call verification yet`
            : "Couldn't compute verification code"}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="mt-2 px-4 py-3 rounded-xl bg-[#0F172A] border border-[#334155]/60 text-xs text-[#94A3B8] leading-relaxed space-y-2">
          {isReady ? (
            <>
              <p className="font-mono text-sm text-[#F8FAFC] tracking-wider text-center py-1">
                {code}
              </p>
              <p>
                This code is generated on your device and {peerName}'s device
                only — RingWave's servers never see the keys used to compute
                it. Read it to each other (or compare it another way you
                trust) to confirm this call hasn't been tampered with. If the
                codes don't match, don't trust the call.
              </p>
            </>
          ) : (
            <p>
              {peerName} hasn't generated a call-verification key yet — this
              happens automatically the next time they open RingWave. Your
              call audio is still encrypted end-to-end between your devices;
              this code is an extra step to actively verify that, not what
              enables it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

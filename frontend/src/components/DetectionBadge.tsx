import { DETECTION_CONFIG } from "@/constants/detection";
import { useCall } from "@/context/CallContext";

interface DetectionBadgeProps {
  /** Extra layout classes merged in alongside the badge's own structural
   *  and color classes (e.g. positioning/margins for where it sits on a
   *  given page) — never a replacement for them, so the badge's color
   *  always reflects the live detectionState regardless of where it's
   *  placed. */
  className?: string;
}

/**
 * Renders the current call's live voice-authenticity verdict, driven by
 * `detectionState`/`detectionConfidence` from CallContext (in turn driven
 * by DetectionTransport's messages from the detection service — see
 * services/detectionTransport.ts and ai-service/app/predictor.py, which
 * runs the real Stage 1 LFCC-LCNN model against the trained checkpoint).
 *
 * Pulled out as its own component rather than inlined in each call page
 * because both ActiveCallPage and GroupCallPage need the identical
 * verdict -> badge rendering; this is the one place that changes if the
 * badge's design changes.
 */
export function DetectionBadge({ className = "" }: DetectionBadgeProps) {
  const { detectionState, detectionConfidence } = useCall();
  const config = DETECTION_CONFIG[detectionState];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-3 px-6 py-3 rounded-2xl border ${config.bg} ${config.border} ${className}`}
    >
      <Icon className={`w-5 h-5 ${config.color}`} />
      <p className={`text-sm font-medium ${config.color}`}>
        {config.label}
        {detectionConfidence !== null && detectionState !== "analyzing" && (
          <span className="opacity-70"> · {detectionConfidence.toFixed(1)}%</span>
        )}
      </p>
    </div>
  );
}

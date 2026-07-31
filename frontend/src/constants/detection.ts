import {
  Wifi, Shield, ShieldAlert, ShieldX,
} from "lucide-react";

export type DetectionState =
  | "analyzing"
  | "genuine"
  | "suspicious"
  | "synthetic";

export interface DetectionConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ElementType;
}

export const DETECTION_CONFIG: Record<DetectionState, DetectionConfig> = {
  analyzing: {
    label: "Analyzing voice...",
    color: "text-[#06B6D4]",
    bg: "bg-[#06B6D4]/10",
    border: "border-[#06B6D4]/30",
    icon: Wifi,
  },
  genuine: {
    label: "Voice Genuine",
    color: "text-[#22C55E]",
    bg: "bg-[#22C55E]/10",
    border: "border-[#22C55E]/30",
    icon: Shield,
  },
  suspicious: {
    label: "Suspicious Pattern",
    color: "text-[#F59E0B]",
    bg: "bg-[#F59E0B]/10",
    border: "border-[#F59E0B]/30",
    icon: ShieldAlert,
  },
  synthetic: {
    label: "⚠ Synthetic Voice",
    color: "text-[#EF4444]",
    bg: "bg-[#EF4444]/10",
    border: "border-[#EF4444]/30",
    icon: ShieldX,
  },
};

// ─── Verdict -> UI state mapping ──────────────────────────────────────────────
//
// The detection service (Python, WebSocket) reports a `prediction` string
// per chunk — see frontend/src/services/detectionTransport.ts and
// ai-service/app/predictor.py, which runs real Stage 1 model inference.
// This is the one place that translates that vocabulary into the
// DetectionState the UI already knows how to render via DETECTION_CONFIG
// above. If the model ever reports a different set of labels, only this
// map needs to change — not the UI components, not CallContext's state
// shape.
const PREDICTION_TO_STATE: Record<string, DetectionState> = {
  likely_real: "genuine",
  uncertain: "suspicious",
  likely_fake: "synthetic",
  likely_synthetic: "synthetic",
};

/**
 * Maps a raw `prediction` string from a verdict message to a DetectionState.
 * Unrecognized/malformed predictions fall back to "analyzing" rather than
 * guessing — an unknown label is closer to "no verdict yet" than to any
 * specific state.
 */
export function mapPredictionToDetectionState(prediction: unknown): DetectionState {
  if (typeof prediction === "string" && prediction in PREDICTION_TO_STATE) {
    return PREDICTION_TO_STATE[prediction];
  }
  return "analyzing";
}
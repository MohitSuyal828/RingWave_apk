export const THEME = {
  colors: {
    primary: "#06B6D4",
    background: "#020617",
    secondary: "#0F172A",
    card: "#1E293B",
    text: "#F8FAFC",
    muted: "#94A3B8",
    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#EF4444",
    border: "#334155",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
  },
  blur: {
    glass: "12px",
  },
} as const;

export const DETECTION_BADGE_STATES = {
  GENUINE: "genuine",
  SUSPICIOUS: "suspicious",
  SYNTHETIC: "synthetic",
  ANALYZING: "analyzing",
  UNKNOWN: "unknown",
} as const;

export type DetectionBadgeState =
  (typeof DETECTION_BADGE_STATES)[keyof typeof DETECTION_BADGE_STATES];

export const DETECTION_COLORS: Record<DetectionBadgeState, string> = {
  genuine: "#22C55E",
  suspicious: "#F59E0B",
  synthetic: "#EF4444",
  analyzing: "#06B6D4",
  unknown: "#94A3B8",
};
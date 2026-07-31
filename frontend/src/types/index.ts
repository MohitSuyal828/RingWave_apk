// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  name: string;
  email: string;
  created_at?: string;
  username?: string;
  avatar?: string;
  isOnline?: boolean;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

// ─── Calls ────────────────────────────────────────────────────────────────────

export type CallType = "one-to-one" | "group";
export type CallStatus = "incoming" | "outgoing" | "active" | "ended" | "missed";

export interface Call {
  id: string;
  type: CallType;
  status: CallStatus;
  participants: User[];
  startedAt?: string;
  endedAt?: string;
  duration?: number;
  detectionSummary?: DetectionSummary;
}

// ─── Detection ────────────────────────────────────────────────────────────────

export type DetectionState =
  | "genuine"
  | "suspicious"
  | "synthetic"
  | "analyzing"
  | "unknown";

export interface DetectionEvent {
  id: string;
  callId: string;
  userId: string;
  state: DetectionState;
  confidenceScore: number;
  timestamp: string;
  message?: string;
}

export interface DetectionSummary {
  overallState: DetectionState;
  averageConfidence: number;
  events: DetectionEvent[];
  flaggedSegments: number;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | "call_incoming"
  | "call_missed"
  | "contact_request"
  | "detection_alert";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  meta?: Record<string, unknown>;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export * from "./call";
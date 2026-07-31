import type { User } from "./index";

export type CallStatus =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended";

export interface ActiveCall {
  callId: string;

  callerId: number;
  callerName: string;

  receiverId: number;
  receiverName: string;

  isIncoming: boolean;

  status: CallStatus;
}

export interface IncomingCallPayload {
  callId: string;

  callerId: number;
  callerName: string;

  receiverId: number;
  receiverName: string;
}

export interface OutgoingCallPayload {
  callId: string;

  callerId: number;
  callerName: string;

  receiverId: number;
  receiverName: string;
}

export interface OfferPayload {
  callId: string;

  from: number;
  to: number;

  offer: RTCSessionDescriptionInit;
}

export interface AnswerPayload {
  callId: string;

  from: number;
  to: number;

  answer: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
  callId: string;

  from: number;
  to: number;

  candidate: RTCIceCandidateInit;
}

export interface CallContextType {
  activeCall: ActiveCall | null;

  localStream: MediaStream | null;

  remoteStream: MediaStream | null;

  isMuted: boolean;

  callUser(user: User): Promise<void>;

  acceptCall(): Promise<void>;

  rejectCall(): void;

  endCall(): void;

  toggleMute(): void;
}
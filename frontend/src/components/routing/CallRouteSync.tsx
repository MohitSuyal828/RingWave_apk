import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCall } from "@/context/CallContext";
import { ROUTES } from "@/constants/routes";

const buildActiveCallPath = (callId: string) =>
  ROUTES.ACTIVE_CALL.replace(":callId", callId);

const buildGroupCallPath = (callId: string) =>
  ROUTES.GROUP_CALL.replace(":callId", callId);

/**
 * Keeps the URL in sync with CallContext's status.
 *
 * Nothing previously connected call state to the router — starting or
 * accepting a call updated CallContext but never navigated anywhere, so
 * the outgoing/incoming/active/group call screens were unreachable.
 */
export function CallRouteSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, incomingCall, callId, isGroupCall } = useCall();
  const prevStatus = useRef(status);

  useEffect(() => {
    if (status === "ringing" && incomingCall) {
      navigate(ROUTES.INCOMING_CALL);
    } else if (status === "calling") {
      navigate(ROUTES.OUTGOING_CALL);
    } else if (status === "connected" && callId) {
      navigate(
        isGroupCall ? buildGroupCallPath(callId) : buildActiveCallPath(callId),
        { replace: true }
      );
    } else if (
      status === "idle" &&
      prevStatus.current !== "idle" &&
      location.pathname.startsWith("/call/")
    ) {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }

    prevStatus.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, incomingCall, callId, isGroupCall]);

  return null;
}

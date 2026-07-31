export interface CallHistoryRow {
  id: number;
  caller_id: number;
  receiver_id: number;
  duration: number;
  status: "completed" | "missed" | "rejected" | string;
  created_at: string;
  call_session_id: string | null;
  caller_name: string | null;
  caller_email?: string | null;
  receiver_name: string | null;
  receiver_email?: string | null;
}

export interface GroupCallEntry {
  key: string;
  isGroup: true;
  createdAt: string;
  /** Only meaningful when the current user was the one who started it —
   *  call_history is logged from the initiator's side, so a group call
   *  only groups back together in the person who made it's own history. */
  rows: CallHistoryRow[];
}

export interface SingleCallEntry {
  key: string;
  isGroup: false;
  createdAt: string;
  row: CallHistoryRow;
}

export type CallEntry = GroupCallEntry | SingleCallEntry;

/**
 * Groups call_history rows that share a call_session_id (a group call
 * logs one row per invited person) back into a single composite entry,
 * so the UI can show "Group call — Alice (2:14), Bob (missed)" instead
 * of two unrelated-looking rows.
 *
 * Rows without a session id, or sessions where only one row exists (a 1:1
 * call, or a group call that only ever reached one other person), stay as
 * single entries.
 */
export function groupCallRows(rows: CallHistoryRow[]): CallEntry[] {
  const bySession = new Map<string, CallHistoryRow[]>();
  const singles: CallHistoryRow[] = [];

  for (const row of rows) {
    if (row.call_session_id) {
      const arr = bySession.get(row.call_session_id) ?? [];
      arr.push(row);
      bySession.set(row.call_session_id, arr);
    } else {
      singles.push(row);
    }
  }

  const entries: CallEntry[] = [];

  for (const [sessionId, sessionRows] of bySession) {
    if (sessionRows.length > 1) {
      entries.push({
        key: sessionId,
        isGroup: true,
        createdAt: sessionRows[0].created_at,
        rows: sessionRows,
      });
    } else {
      singles.push(sessionRows[0]);
    }
  }

  for (const row of singles) {
    entries.push({
      key: `single-${row.id}`,
      isGroup: false,
      createdAt: row.created_at,
      row,
    });
  }

  entries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return entries;
}

/** Name of the "other side" of a single (non-group) call row. */
export function otherPartyName(row: CallHistoryRow, currentUserId?: number) {
  return (
    (row.caller_id === currentUserId ? row.receiver_name : row.caller_name) ??
    "Unknown"
  );
}

export function otherPartyId(row: CallHistoryRow, currentUserId?: number) {
  return row.caller_id === currentUserId ? row.receiver_id : row.caller_id;
}

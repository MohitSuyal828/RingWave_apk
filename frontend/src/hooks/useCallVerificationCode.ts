import { useEffect, useRef, useState } from "react";
import {
  getOrCreateIdentityKeyPair,
  exportPublicKeyJwk,
  importPublicKeyJwk,
} from "@/lib/crypto/identity";
import {
  deriveSharedSecret,
  deriveVerificationCode,
  exportPublicKeyRaw,
} from "@/lib/crypto/verification";
import { uploadOwnIdentityKey, fetchContactIdentityKey } from "@/services/identityKey";

export type VerificationStatus =
  | "idle"
  | "computing"
  | "ready"
  | "contact-has-no-key"
  | "error";

/**
 * Computes the 16-digit call verification code for one peer in an active
 * call. Entirely client-side: fetches the peer's PUBLIC key from the
 * server (the only thing the server ever holds) and combines it with this
 * device's own private key, which never leaves the browser — see
 * lib/crypto/identity.ts and lib/crypto/verification.ts for the actual
 * cryptography and why the server can't compute this itself.
 *
 * Returns "contact-has-no-key" (not "error") when the peer simply hasn't
 * generated an identity key yet — a normal state, not a failure, since
 * this feature rolled out after some users' first login.
 */
export function useCallVerificationCode(peerId: number | null, callId: string | null) {
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [code, setCode] = useState<string | null>(null);

  // Guards against a stale async chain (e.g. the call ended and a new one
  // started with a different peerId before the first fetch resolved)
  // overwriting state that no longer applies to the current call.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!peerId || !callId) {
      setStatus("idle");
      setCode(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("computing");
    setCode(null);

    (async () => {
      try {
        const { privateKey, publicKey } = await getOrCreateIdentityKeyPair();

        // Idempotent — safe to call every time rather than tracking
        // "have I already uploaded this session" separately. The
        // backend upserts, so a repeat PUT with the same key is a no-op
        // in effect.
        const ownJwk = await exportPublicKeyJwk(publicKey);
        await uploadOwnIdentityKey(ownJwk);

        const contactKey = await fetchContactIdentityKey(peerId);

        if (requestIdRef.current !== requestId) return; // stale — a newer call superseded this one

        if (!contactKey) {
          setStatus("contact-has-no-key");
          return;
        }

        const contactPublicKey = await importPublicKeyJwk(contactKey.publicKey);

        const sharedSecret = await deriveSharedSecret(privateKey, contactPublicKey);
        const localRaw = await exportPublicKeyRaw(publicKey);
        const contactRaw = await exportPublicKeyRaw(contactPublicKey);

        const verificationCode = await deriveVerificationCode(
          sharedSecret,
          localRaw,
          contactRaw,
          callId
        );

        if (requestIdRef.current !== requestId) return;

        setCode(verificationCode);
        setStatus("ready");
      } catch (err) {
        console.error("[useCallVerificationCode] failed to compute verification code:", err);
        if (requestIdRef.current === requestId) setStatus("error");
      }
    })();
  }, [peerId, callId]);

  return { status, code };
}

// ===========================================================================
// verification.ts — derives the 16-digit call verification code.
//
// Both participants compute this independently, entirely client-side, from
// (their own private key + the other's public key + both raw public keys +
// the call's id). No code or secret is ever transmitted over the network
// for this to work — that's the point: if both sides display the same
// code, it proves both sides are talking to who they think they are,
// without RingWave's server (or anyone else) having been able to
// substitute a different key along the way undetected.
//
// The derivation logic here is deliberately identical to the standalone
// proof in /verify-call-encryption-design.js (run it — `node
// verify-call-encryption-design.js` from the repo root — to see two
// independent parties always derive matching codes, and that a
// public-keys-only observer cannot) — that file is the executable proof
// this comment is describing.
// ===========================================================================

/** Canonical ordering so both sides hash the two public keys in the same
 *  order regardless of who's "local" vs "remote" — otherwise Alice and Bob
 *  would compute different codes despite agreeing on the same secret. */
function orderBuffers(a: ArrayBuffer, b: ArrayBuffer): [ArrayBuffer, ArrayBuffer] {
  const aBytes = new Uint8Array(a);
  const bBytes = new Uint8Array(b);

  for (let i = 0; i < Math.min(aBytes.length, bBytes.length); i++) {
    if (aBytes[i] !== bBytes[i]) {
      return aBytes[i] < bBytes[i] ? [a, b] : [b, a];
    }
  }

  return [a, b];
}

function concatBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

/**
 * Derives the shared secret for this call. `privateKey` is this device's
 * own identity private key (never leaves this module); `contactPublicKey`
 * is the other participant's public key, imported via
 * identity.ts's importPublicKeyJwk.
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  contactPublicKey: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: contactPublicKey },
    privateKey,
    256
  );
}

/**
 * Derives the human-readable 16-digit verification code, formatted as
 * "1234 5678 9012 3456" for readability when read aloud or compared.
 *
 * `callId` binds the code to one specific call session rather than being a
 * static value that never changes for a given contact pair — mirroring
 * why WhatsApp's safety number is tied to identity rather than being
 * reused as a raw session key elsewhere.
 */
export async function deriveVerificationCode(
  sharedSecret: ArrayBuffer,
  localPublicKeyRaw: ArrayBuffer,
  remotePublicKeyRaw: ArrayBuffer,
  callId: string
): Promise<string> {
  const [first, second] = orderBuffers(localPublicKeyRaw, remotePublicKeyRaw);

  const callIdBytes = new TextEncoder().encode(callId).buffer as ArrayBuffer;

  const material = concatBuffers(sharedSecret, first, second, callIdBytes);

  const digest = await crypto.subtle.digest("SHA-256", material);
  const bytes = new Uint8Array(digest);

  // 16 digits: take the first 7 bytes (56 bits, comfortably more than
  // 10^16 needs), interpret as a big integer, mod down to 16 digits.
  let n = 0n;
  for (let i = 0; i < 7; i++) n = (n << 8n) | BigInt(bytes[i]);
  const code = (n % 10000000000000000n).toString().padStart(16, "0");

  return code.match(/.{1,4}/g)!.join(" ");
}

/** Exports a CryptoKey's raw public-key bytes, used as input to deriveVerificationCode's ordering/hashing. */
export async function exportPublicKeyRaw(publicKey: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", publicKey);
}

// ===========================================================================
// identity.ts — per-device ECDH identity keypair for call verification.
//
// WHAT THIS IS FOR
// A persistent public/private keypair, generated once per browser/device
// and reused for every call. The public half is uploaded to RingWave's
// server (PUT /users/identity-key) so contacts can fetch it; the private
// half is used locally to derive a shared secret with a contact during a
// call, which in turn produces the 16-digit verification code shown in
// ActiveCallPage/GroupCallPage. See verification.ts for that part.
//
// WHY THE SERVER CAN'T DECRYPT ANYTHING FROM THIS
// The server only ever receives the PUBLIC key (exported via
// subtle.exportKey("jwk", publicKey)). ECDH's entire premise is that a
// public key reveals nothing about the matching private key — deriving
// the shared secret requires YOUR private key + the OTHER side's public
// key; having only two public keys (which is all the server's database
// ever holds — see backend/src/models/identityKeyModel.js) is
// cryptographically insufficient to compute that secret. This isn't a
// policy choice RingWave is promising to honor; it's a mathematical
// property of the elliptic-curve Diffie-Hellman keys generated below.
//
// AN HONEST CAVEAT ON "NON-EXTRACTABLE"
// subtle.generateKey() takes a single `extractable` flag that applies to
// BOTH keys in the returned pair — there's no way to ask the browser for
// an extractable public key paired with a truly inextractable private
// key in one call. Since the public key MUST be exportable (to upload
// it), this module generates the pair with extractable: true, which
// means the private CryptoKey object is technically capable of being
// exported if something with a reference to it called exportKey() on it.
// The real protection this module provides is architectural, not a
// browser-enforced hardware boundary: the private key CryptoKey object
// never leaves this module's closure, nothing in this codebase ever calls
// exportKey on it, and it's persisted via IndexedDB's structured-clone
// support for CryptoKey objects (storing the opaque key object itself,
// never raw exported bytes). A meaningfully stronger guarantee would
// require a hardware-backed key store (e.g. the (still-experimental)
// CryptoKey non-extractable-pair proposals, or WebAuthn-adjacent APIs) —
// out of scope for what a browser can promise universally today.
// ===========================================================================

const DB_NAME = "ringwave-identity";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const KEY_RECORD_ID = "identity-keypair";

interface StoredKeyRecord {
  id: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadStoredKeyPair(): Promise<StoredKeyRecord | null> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(KEY_RECORD_ID);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function saveKeyPair(record: StoredKeyRecord): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let cachedKeyPair: CryptoKeyPair | null = null;
let inFlightInit: Promise<CryptoKeyPair> | null = null;

/**
 * Returns this device's persistent ECDH identity keypair, generating and
 * storing one on first use. Safe to call repeatedly — subsequent calls
 * return the same cached pair without touching IndexedDB again.
 */
export async function getOrCreateIdentityKeyPair(): Promise<CryptoKeyPair> {
  if (cachedKeyPair) return cachedKeyPair;

  // Two concurrent callers (e.g. app boot + an immediate incoming call)
  // shouldn't race to generate two different keypairs and stomp on each
  // other in IndexedDB — share one in-flight initialization.
  if (inFlightInit) return inFlightInit;

  inFlightInit = (async () => {
    const existing = await loadStoredKeyPair();

    if (existing) {
      cachedKeyPair = {
        privateKey: existing.privateKey,
        publicKey: existing.publicKey,
      };
      return cachedKeyPair;
    }

    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true, // see header comment — required so the public half can be exported/uploaded
      ["deriveBits"]
    );

    await saveKeyPair({
      id: KEY_RECORD_ID,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    });

    cachedKeyPair = keyPair;
    return keyPair;
  })();

  try {
    return await inFlightInit;
  } finally {
    inFlightInit = null;
  }
}

/** Exports this device's PUBLIC key as a JWK, ready to upload to the server. */
export async function exportPublicKeyJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", publicKey);
}

/** Imports a contact's public key JWK (as fetched from the server) into a usable CryptoKey. */
export async function importPublicKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [] // a public key used only as the "public" param to deriveBits needs no usages of its own
  );
}

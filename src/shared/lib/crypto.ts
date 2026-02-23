const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

async function deriveKey(): Promise<CryptoKey> {
  const extensionId =
    typeof chrome !== "undefined" && chrome.runtime?.id
      ? chrome.runtime.id
      : "ai-bookmark-organizer-default";

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(extensionId),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: ENCODER.encode("ai-bookmark-organizer-salt"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    ENCODER.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(ciphertext: string): Promise<string> {
  const key = await deriveKey();
  const combined = Uint8Array.from(atob(ciphertext), (c) =>
    c.charCodeAt(0),
  );
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return DECODER.decode(decrypted);
}

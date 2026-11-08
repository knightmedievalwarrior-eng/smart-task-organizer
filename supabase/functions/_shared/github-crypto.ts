import { requiredEnv } from "./http.ts";

function decodeBase64(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let raw = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    raw += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(raw);
}

async function encryptionKey(): Promise<CryptoKey> {
  const bytes = decodeBase64(requiredEnv("GITHUB_TOKEN_ENCRYPTION_KEY"));
  if (bytes.byteLength !== 32)
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptGithubToken(
  token: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(token),
  );
  return { ciphertext: encodeBase64(new Uint8Array(encrypted)), iv: encodeBase64(iv) };
}

export async function decryptGithubToken(ciphertext: string, iv: string): Promise<string> {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(iv) },
    await encryptionKey(),
    decodeBase64(ciphertext),
  );
  return new TextDecoder().decode(clear);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

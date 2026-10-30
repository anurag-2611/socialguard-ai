import { sha256 } from '@noble/hashes/sha256';

/** SHA-256 hex digest, including when the browser disables Web Crypto on an HTTP LAN origin. */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data))
    : sha256(data);
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

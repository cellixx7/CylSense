import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Valor aleatorio URL-safe (256 bits por padrao). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** PKCE (RFC 7636) com metodo S256. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Comparacao em tempo constante para state/tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

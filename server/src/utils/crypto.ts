import crypto from "crypto";
import { config } from "../config/env";

// Derive a 32-byte key from the configured encryption secret
const KEY = crypto
  .createHash("sha256")
  .update(config.encryptionSecret)
  .digest();

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Encrypts a plaintext string using AES-256-GCM
 * Output format: iv:authTag:ciphertext (hex encoded)
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an AES-256-GCM encrypted payload
 */
export function decrypt(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Generates a signed, tamper-proof OAuth state token containing a random nonce
 * and timestamp with a signature.
 */
export function generateOAuthState(data?: Record<string, unknown>): string {
  const payload = JSON.stringify({
    nonce: crypto.randomBytes(16).toString("hex"),
    timestamp: Date.now(),
    data: data || {},
  });

  const hmac = crypto.createHmac("sha256", config.sessionSecret);
  hmac.update(payload);
  const signature = hmac.digest("hex");

  return Buffer.from(JSON.stringify({ payload, signature })).toString(
    "base64url"
  );
}

/**
 * Validates and decodes an OAuth state token.
 * Prevents replay attacks (expires in 15 minutes) and CSRF.
 */
export function verifyOAuthState(
  stateString: string,
  maxAgeMs = 15 * 60 * 1000
): { valid: boolean; data?: Record<string, unknown>; error?: string } {
  try {
    const raw = Buffer.from(stateString, "base64url").toString("utf8");
    const { payload, signature } = JSON.parse(raw);

    const hmac = crypto.createHmac("sha256", config.sessionSecret);
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      )
    ) {
      return { valid: false, error: "State signature mismatch" };
    }

    const parsed = JSON.parse(payload);
    if (Date.now() - parsed.timestamp > maxAgeMs) {
      return { valid: false, error: "OAuth state expired" };
    }

    return { valid: true, data: parsed.data };
  } catch {
    return { valid: false, error: "Malformed OAuth state token" };
  }
}

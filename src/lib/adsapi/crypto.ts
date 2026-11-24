import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encryption at rest for the Amazon Ads refresh token: AES-256-GCM, stored as
 * "v1.<iv>.<tag>.<ciphertext>" (base64url). The key is derived (HKDF-SHA256) from ADS_TOKEN_KEY,
 * or from ADS_CLIENT_SECRET when that isn't set, so the database alone never holds a usable token.
 * Rotating the secret makes the stored token unreadable: connect again.
 */
function key(env: NodeJS.ProcessEnv): Buffer {
  const secret = env.ADS_TOKEN_KEY || env.ADS_CLIENT_SECRET || env.ADS_LWA_CLIENT_SECRET;
  if (!secret) throw new Error("Set ADS_CLIENT_SECRET (or ADS_TOKEN_KEY) on the server to store the Amazon Ads token");
  return Buffer.from(hkdfSync("sha256", secret, "wholesale-scout", "ads-refresh-token", 32));
}

export function encryptToken(plain: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(env), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptToken(stored: string, env: NodeJS.ProcessEnv = process.env): string {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("The stored Amazon Ads token isn't readable: connect again");
  try {
    const d = createDecipheriv("aes-256-gcm", key(env), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new Error("The stored Amazon Ads token can't be decrypted (the secret changed?): connect again");
  }
}

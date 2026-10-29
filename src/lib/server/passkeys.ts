import "server-only";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { db, must } from "./db";
import { deviceName, isAllowed, listPasskeys, saveChallenge, takeChallenge, type Passkey } from "./auth";

/**
 * Passkeys with SimpleWebAuthn. The relying party is the app's address (APP_URL): a passkey made on
 * ws.dgr8cali.co.uk only works there. Local runs (http://localhost) use their own origin.
 */
export function relyingParty(requestOrigin: string): { rpID: string; origin: string } {
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin);
  const origin = local ? requestOrigin : (process.env.APP_URL ?? "https://ws.dgr8cali.co.uk").replace(/\/$/, "");
  return { rpID: new URL(origin).hostname, origin };
}

/** The account's fixed WebAuthn user handle (so every passkey belongs to the same user). */
const userId = (email: string) => new TextEncoder().encode(email.toLowerCase());

/** Options to add a passkey to the signed-in account; the challenge's id goes in a cookie. */
export async function registrationOptions(email: string, requestOrigin: string) {
  const { rpID } = relyingParty(requestOrigin);
  const existing = (await listPasskeys()).filter((p) => p.email === email.toLowerCase());
  const options = await generateRegistrationOptions({
    rpName: "Wholesale Scout", rpID, userName: email, userDisplayName: email, userID: userId(email),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports })),
    // A discoverable credential: sign-in needs no email typed, the device offers the passkey.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  return { options, challengeId: await saveChallenge("register", options.challenge, email.toLowerCase()) };
}

export async function registerPasskey(response: RegistrationResponseJSON, challengeId: string | undefined, requestOrigin: string, name: string | null, userAgent: string | null): Promise<Passkey> {
  const ch = await takeChallenge(challengeId, "register");
  if (!ch?.email) throw new AuthError("That request expired: try adding the passkey again.");
  const { rpID, origin } = relyingParty(requestOrigin);
  const v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  if (!v.verified) throw new AuthError("The passkey couldn't be verified.");
  const c = v.registrationInfo.credential;
  return must(await db().from("auth_passkeys").insert({
    email: ch.email, credential_id: c.id, public_key: isoBase64URL.fromBuffer(c.publicKey), counter: c.counter, transports: c.transports ?? [],
    device_type: v.registrationInfo.credentialDeviceType, backed_up: v.registrationInfo.credentialBackedUp,
    name: (name?.trim() || deviceName(userAgent)).slice(0, 60),
  }).select("*").single(), "save passkey") as Passkey;
}

/** Options to sign in: any of the account's passkeys (the device picks; nothing typed). */
export async function loginOptions(requestOrigin: string) {
  const { rpID } = relyingParty(requestOrigin);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  return { options, challengeId: await saveChallenge("login", options.challenge, null) };
}

/** The passkey that signed this response, verified; else an AuthError. */
export async function verifyLogin(response: AuthenticationResponseJSON, challengeId: string | undefined, requestOrigin: string): Promise<Passkey> {
  const ch = await takeChallenge(challengeId, "login");
  if (!ch) throw new AuthError("That sign-in expired: try again.");
  const key = must(await db().from("auth_passkeys").select("*").eq("credential_id", response.id).maybeSingle(), "passkey") as Passkey | null;
  if (!key) throw new AuthError("This passkey isn't registered here. Sign in by email, then add it in Settings → Security.");
  if (!isAllowed(key.email)) throw new AuthError("This account isn't allowed to sign in.");
  const { rpID, origin } = relyingParty(requestOrigin);
  const v = await verifyAuthenticationResponse({
    response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
    credential: { id: key.credential_id, publicKey: isoBase64URL.toBuffer(key.public_key), counter: Number(key.counter), transports: key.transports },
  });
  if (!v.verified) throw new AuthError("The passkey couldn't be verified.");
  must(await db().from("auth_passkeys").update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString(), backed_up: v.authenticationInfo.credentialBackedUp }).eq("id", key.id), "passkey used");
  return key;
}

/** A sign-in refusal that's safe to show. */
export class AuthError extends Error {}

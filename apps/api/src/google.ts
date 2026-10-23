import { OAuth2Client } from "google-auth-library";
import { env } from "./config.js";

/** What the app needs from a verified Google ID token. */
export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity>;

export class GoogleTokenError extends Error {}

const client = new OAuth2Client();

/**
 * Verifies a Google ID token: signature against Google's published keys, expiry, issuer
 * (accounts.google.com) and audience, which must be one of GOOGLE_CLIENT_IDS (the Web
 * client and the Android client both mint tokens for this backend).
 */
export const verifyWithGoogle: GoogleVerifier = async (idToken) => {
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_IDS });
    payload = ticket.getPayload();
  } catch (error) {
    throw new GoogleTokenError(error instanceof Error ? error.message : "Invalid Google token");
  }
  if (!payload?.sub) throw new GoogleTokenError("Google token has no subject");
  return {
    sub: payload.sub,
    email: payload.email?.toLowerCase() ?? null,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? null,
  };
};

let verifier: GoogleVerifier = verifyWithGoogle;

export const verifyGoogleIdToken = (idToken: string): Promise<GoogleIdentity> => verifier(idToken);

/** Test seam: integration tests replace the network-bound verifier with a fake. */
export function setGoogleVerifier(next: GoogleVerifier): GoogleVerifier {
  const previous = verifier;
  verifier = next;
  return previous;
}

export const googleSignInConfigured = (): boolean => env.GOOGLE_CLIENT_IDS.length > 0;

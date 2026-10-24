import { createHash, randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@prisma/client";
import { createAccessToken, requireAuth } from "./auth.js";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { AccountDeletionRefused, DEMO_EMAIL, deleteUserAccount } from "./account.js";
import { GoogleTokenError, googleSignInConfigured, verifyGoogleIdToken } from "./google.js";
import { appUrl, sendMailInBackground } from "./mailer.js";
import {
  accountDeletionRateLimit,
  allowEmailTo,
  emailRequestRateLimit,
  googleSignInRateLimit,
  loginRateLimit,
  registerRateLimit,
  tokenRedeemRateLimit,
} from "./rate-limits.js";

/**
 * Sign-up, sign-in (password and Google), password reset, email verification and
 * account deletion. Everything here except DELETE /users/me works signed out.
 */

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = credentials.extend({
  display_name: z.string().min(1).max(80),
});

const emailOnly = z.object({ email: z.string().email() });
const tokenSchema = z.object({ token: z.string().min(16).max(200) });
const resetSchema = tokenSchema.extend({ password: z.string().min(8) });
const googleSchema = z.object({ credential: z.string().min(1).max(8192) });
const deleteMeSchema = z
  .object({ password: z.string().min(1).optional(), google_credential: z.string().min(1).max(8192).optional() })
  .refine((value) => Boolean(value.password) !== Boolean(value.google_credential), "Confirm with your password or with Google");

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

type TokenPurpose = "password_reset" | "email_verification";

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** A new single-use token; any earlier unused token of the same purpose stops working. */
async function issueToken(userId: string, purpose: TokenPurpose, ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { user_id: userId, purpose, used_at: null } }),
    prisma.authToken.create({
      data: { user_id: userId, purpose, token_hash: hashToken(token), expires_at: new Date(Date.now() + ttlMs) },
    }),
  ]);
  return token;
}

/**
 * Redeems a token at most once: the conditional update is atomic, so two concurrent
 * redemptions of the same token can't both succeed. Returns the user id, or null for a
 * token that is unknown, expired, already used or for another purpose.
 */
async function consumeToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  const token_hash = hashToken(token);
  const row = await prisma.authToken.findUnique({ where: { token_hash }, select: { user_id: true } });
  if (!row) return null;
  const { count } = await prisma.authToken.updateMany({
    where: { token_hash, purpose, used_at: null, expires_at: { gt: new Date() } },
    data: { used_at: new Date() },
  });
  return count === 1 ? row.user_id : null;
}

const publicUser = (user: Pick<User, "id" | "email" | "display_name" | "narration_voice_id" | "role">) => ({
  id: user.id,
  email: user.email,
  display_name: user.display_name,
  narration_voice_id: user.narration_voice_id,
  role: user.role,
});

const session = (user: Parameters<typeof publicUser>[0] & Pick<User, "token_version">) => ({
  accessToken: createAccessToken({ sub: user.id, email: user.email, tv: user.token_version }),
  user: publicUser(user),
});

async function sendVerificationEmail(user: Pick<User, "id" | "email" | "display_name">): Promise<void> {
  const token = await issueToken(user.id, "email_verification", EMAIL_VERIFICATION_TTL_MS);
  void sendMailInBackground({
    to: user.email,
    subject: "Confirm your Midivory email",
    text: [
      `Hi ${user.display_name},`,
      "",
      "Confirm your email address to finish setting up your Midivory account:",
      `${appUrl()}/verify-email?token=${token}`,
      "",
      "The link works once and expires in 48 hours. If you didn't sign up, you can ignore this email.",
    ].join("\n"),
  });
}

const invalidToken = (res: Response) =>
  res.status(400).json({ error: { code: "invalid_token", message: "This link is invalid or has expired. Request a new one." } });

const accepted = (res: Response) => res.status(202).json({ ok: true });

export const authRouter: Router = Router();

authRouter.post("/auth/register", registerRateLimit, async (req, res, next) => {
  try {
    if (!env.REGISTRATION_OPEN) {
      res.status(403).json({
        error: { code: "registration_closed", message: "Sign-up is closed. Ask an administrator for an account." },
      });
      return;
    }
    const input = registerSchema.parse(req.body);
    const password_hash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: { email: input.email.toLowerCase(), display_name: input.display_name, password_hash },
    });
    if (env.REQUIRE_EMAIL_VERIFICATION) {
      await sendVerificationEmail(user);
      // No session until the address is confirmed.
      res.status(201).json({ verificationRequired: true, email: user.email });
      return;
    }
    res.status(201).json(session(user));
  } catch (e) {
    next(e);
  }
});

authRouter.post("/auth/login", loginRateLimit, async (req, res, next) => {
  try {
    const input = credentials.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    // The shared demo account has a published password, so a public deployment refuses it
    // outright (same answer as any wrong password) even if the row was seeded there.
    const demoBlocked = env.PUBLIC_CATALOGUE && user?.email === DEMO_EMAIL;
    if (!user || demoBlocked || !(await bcrypt.compare(input.password, user.password_hash))) {
      res.status(401).json({ error: { code: "invalid_credentials", message: "Email or password is incorrect" } });
      return;
    }
    // Checked only after the password, so it reveals nothing about unknown addresses.
    if (env.REQUIRE_EMAIL_VERIFICATION && !user.email_verified_at) {
      res.status(403).json({
        error: { code: "email_not_verified", message: "Confirm your email first: use the link we sent you, or send a new one." },
      });
      return;
    }
    res.json(session(user));
  } catch (e) {
    next(e);
  }
});

/**
 * Always the same 202, whether or not the address has an account, so the form can't be
 * used to discover who is registered. The email goes out in the background.
 */
authRouter.post("/auth/forgot-password", emailRequestRateLimit, async (req, res, next) => {
  try {
    const { email } = emailOnly.parse(req.body);
    // The lookup and token work happen after the response, so a known address doesn't
    // answer measurably slower than an unknown one.
    accepted(res);
    void (async () => {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user || !allowEmailTo(user.email)) return;
      const token = await issueToken(user.id, "password_reset", PASSWORD_RESET_TTL_MS);
      await sendMailInBackground({
        to: user.email,
        subject: "Reset your Midivory password",
        text: [
          `Hi ${user.display_name},`,
          "",
          "Someone (hopefully you) asked to reset the password for this Midivory account. Choose a new one here:",
          `${appUrl()}/reset-password?token=${token}`,
          "",
          "The link works once and expires in 30 minutes. If you didn't ask for this, ignore this email: your password stays the same.",
        ].join("\n"),
      });
    })().catch((error: unknown) => console.error("Forgot-password request failed", error));
  } catch (e) {
    next(e);
  }
});

authRouter.post("/auth/reset-password", tokenRedeemRateLimit, async (req, res, next) => {
  try {
    const input = resetSchema.parse(req.body);
    const userId = await consumeToken(input.token, "password_reset");
    if (!userId) {
      invalidToken(res);
      return;
    }
    const password_hash = await bcrypt.hash(input.password, 12);
    // Bumping token_version signs out every existing session.
    const user = await prisma.user.update({ where: { id: userId }, data: { password_hash, token_version: { increment: 1 } } });
    // Receiving the email proves the address.
    if (!user.email_verified_at) await prisma.user.update({ where: { id: userId }, data: { email_verified_at: new Date() } });
    // Any other outstanding reset links for this account are now void.
    await prisma.authToken.deleteMany({ where: { user_id: userId, purpose: "password_reset", used_at: null } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/auth/verify-email", tokenRedeemRateLimit, async (req, res, next) => {
  try {
    const { token } = tokenSchema.parse(req.body);
    const userId = await consumeToken(token, "email_verification");
    if (!userId) {
      invalidToken(res);
      return;
    }
    const user = await prisma.user.update({ where: { id: userId }, data: { email_verified_at: new Date() } });
    // The link signs you in: you just proved the address.
    res.json(session(user));
  } catch (e) {
    next(e);
  }
});

authRouter.post("/auth/resend-verification", emailRequestRateLimit, async (req, res, next) => {
  try {
    const { email } = emailOnly.parse(req.body);
    accepted(res);
    void (async () => {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (user && !user.email_verified_at && allowEmailTo(user.email)) await sendVerificationEmail(user);
    })().catch((error: unknown) => console.error("Resend-verification request failed", error));
  } catch (e) {
    next(e);
  }
});

const displayNameFor = (identity: { name: string | null; email: string }): string =>
  (identity.name?.trim() || identity.email.split("@")[0] || "Pianist").slice(0, 80);

/**
 * Google sign-in. Accepts an ID token minted for one of GOOGLE_CLIENT_IDS and returns the
 * app's own session. Matching order: an account already linked to this Google subject;
 * else the account with the same address, if Google says the address is verified (it is
 * then linked); else a new account (when sign-up is open).
 */
authRouter.post("/auth/google", googleSignInRateLimit, async (req, res, next) => {
  try {
    if (!googleSignInConfigured()) {
      res.status(503).json({ error: { code: "google_not_configured", message: "Google sign-in is not set up on this server" } });
      return;
    }
    const { credential } = googleSchema.parse(req.body);
    let identity;
    try {
      identity = await verifyGoogleIdToken(credential);
    } catch (error) {
      if (error instanceof GoogleTokenError) {
        res.status(401).json({ error: { code: "invalid_google_token", message: "Google sign-in failed. Try again." } });
        return;
      }
      throw error;
    }

    const linked = await prisma.user.findUnique({ where: { google_sub: identity.sub } });
    if (linked) {
      res.json({ ...session(linked), created: false });
      return;
    }
    if (!identity.email || !identity.emailVerified) {
      res.status(403).json({
        error: { code: "google_email_unverified", message: "Your Google account's email address isn't verified, so it can't be used to sign in." },
      });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email: identity.email } });
    if (existing) {
      if (existing.google_sub) {
        // Same address, but already linked to a different Google account.
        res.status(409).json({
          error: { code: "google_account_mismatch", message: "This email is already linked to a different Google account." },
        });
        return;
      }
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: { google_sub: identity.sub, email_verified_at: existing.email_verified_at ?? new Date() },
      });
      res.json({ ...session(user), created: false });
      return;
    }
    if (!env.REGISTRATION_OPEN) {
      res.status(403).json({
        error: { code: "registration_closed", message: "Sign-up is closed. Ask an administrator for an account." },
      });
      return;
    }
    // No password of its own: an unguessable hash. "Forgot password" can set a real one.
    const password_hash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
    const user = await prisma.user.create({
      data: {
        email: identity.email,
        display_name: displayNameFor({ name: identity.name, email: identity.email }),
        password_hash,
        google_sub: identity.sub,
        email_verified_at: new Date(),
      },
    });
    res.status(201).json({ ...session(user), created: true });
  } catch (e) {
    next(e);
  }
});

function sendDeletionRefused(res: Response, error: AccountDeletionRefused) {
  res.status(403).json({ error: { code: error.code, message: error.message } });
}

const wrongPassword = (res: Response) =>
  res.status(401).json({ error: { code: "invalid_credentials", message: "Email or password is incorrect" } });

/** Signed-out deletion, for the public /delete-account page: email + password. */
authRouter.post("/auth/delete-account", accountDeletionRateLimit, async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      wrongPassword(res);
      return;
    }
    await deleteUserAccount(user.id);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof AccountDeletionRefused) {
      sendDeletionRefused(res, e);
      return;
    }
    next(e);
  }
});

const signedInUserId = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

/** "Sign out everywhere": voids every access token, then hands this device a fresh one. */
authRouter.post("/auth/sign-out-all", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: signedInUserId(req) },
      data: { token_version: { increment: 1 } },
    });
    res.json(session(user));
  } catch (e) {
    next(e);
  }
});

/** In-app deletion (Settings → Account), re-confirmed with the password or with Google. */
authRouter.delete("/users/me", requireAuth, accountDeletionRateLimit, async (req, res, next) => {
  try {
    const input = deleteMeSchema.parse(req.body ?? {});
    const user = await prisma.user.findUnique({ where: { id: signedInUserId(req) } });
    if (!user) {
      res.status(404).json({ error: { code: "not_found", message: "User not found" } });
      return;
    }
    if (input.password !== undefined) {
      if (!(await bcrypt.compare(input.password, user.password_hash))) {
        res.status(401).json({ error: { code: "invalid_credentials", message: "Password is incorrect" } });
        return;
      }
    } else {
      let identity;
      try {
        identity = googleSignInConfigured() ? await verifyGoogleIdToken(input.google_credential!) : null;
      } catch (error) {
        if (!(error instanceof GoogleTokenError)) throw error;
        identity = null;
      }
      if (!identity || !user.google_sub || identity.sub !== user.google_sub) {
        res.status(401).json({ error: { code: "invalid_credentials", message: "Confirm with the Google account linked to this account" } });
        return;
      }
    }
    await deleteUserAccount(user.id);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof AccountDeletionRefused) {
      sendDeletionRefused(res, e);
      return;
    }
    next(e);
  }
});

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./config.js";
import { prisma } from "./db.js";

declare global { namespace Express { interface Request { userId?: string } } }
export interface TokenPayload { sub: string; email: string; tv?: number }

/**
 * `tv` is the user's token_version when the token was issued. Bumping the column
 * (password change/reset, sign out everywhere) voids every token issued before it.
 * Tokens minted before this claim existed count as version 0.
 */
export function createAccessToken(user: TokenPayload): string {
  return jwt.sign({ ...user, tv: user.tv ?? 0 }, env.JWT_SECRET, { expiresIn: "8h" });
}

const reject = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    reject(res, 401, "unauthorized", "A Bearer access token is required");
    return;
  }
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (typeof payload.sub !== "string") throw new Error("no subject");
  } catch {
    reject(res, 401, "invalid_token", "The access token is invalid or expired");
    return;
  }
  try {
    // One primary-key lookup per request: also catches deleted accounts.
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { token_version: true } });
    const issuedVersion = typeof payload.tv === "number" ? payload.tv : 0;
    if (!user || user.token_version !== issuedVersion) {
      reject(res, 401, "invalid_token", "The access token is invalid or expired");
      return;
    }
    req.userId = payload.sub;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Admin gate. Must run after requireAuth. Checks the role in the database
 * (not the JWT) so role changes take effect without waiting out an 8h token.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.userId
      ? await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } })
      : null;
    if (user?.role !== "admin") {
      res.status(403).json({ error: { code: "forbidden", message: "Admin access required" } });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** True if the given user id belongs to an admin. Used for read-time unlock logic. */
export async function isAdmin(userIdValue: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userIdValue }, select: { role: true } });
  return user?.role === "admin";
}

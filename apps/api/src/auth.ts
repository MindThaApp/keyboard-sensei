import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./config.js";
import { prisma } from "./db.js";

declare global { namespace Express { interface Request { userId?: string } } }
export interface TokenPayload { sub: string; email: string }
export function createAccessToken(user: TokenPayload): string { return jwt.sign(user,env.JWT_SECRET,{expiresIn:"8h"}) }
export function requireAuth(req:Request,res:Response,next:NextFunction): void {
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(!token){res.status(401).json({error:{code:"unauthorized",message:"A Bearer access token is required"}});return}
  try { const payload=jwt.verify(token,env.JWT_SECRET) as jwt.JwtPayload; if(typeof payload.sub!=="string") throw new Error(); req.userId=payload.sub; next() }
  catch { res.status(401).json({error:{code:"invalid_token",message:"The access token is invalid or expired"}}) }
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

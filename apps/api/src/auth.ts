import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./config.js";

declare global { namespace Express { interface Request { userId?: string } } }
export interface TokenPayload { sub: string; email: string }
export function createAccessToken(user: TokenPayload): string { return jwt.sign(user,env.JWT_SECRET,{expiresIn:"8h"}) }
export function requireAuth(req:Request,res:Response,next:NextFunction): void {
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(!token){res.status(401).json({error:{code:"unauthorized",message:"A Bearer access token is required"}});return}
  try { const payload=jwt.verify(token,env.JWT_SECRET) as jwt.JwtPayload; if(typeof payload.sub!=="string") throw new Error(); req.userId=payload.sub; next() }
  catch { res.status(401).json({error:{code:"invalid_token",message:"The access token is invalid or expired"}}) }
}

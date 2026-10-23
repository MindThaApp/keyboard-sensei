import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ChallengeError, challengeToday, finishAttempt, startAttempt } from "./service.js";

/** Daily challenge routes; mounted behind requireAuth. */
export const challengeRouter: Router = Router();

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

const startSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tier: z.number().int().min(1).max(3),
});

const finishSchema = z.object({
  score: z.number().finite().min(0).max(100),
  accuracy: z.number().finite().min(0).max(100),
});

function fail(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ChallengeError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  next(error);
}

challengeRouter.get("/challenge/today", async (req, res, next) => {
  try {
    res.json(await challengeToday(prisma, uid(req)));
  } catch (e) {
    fail(e, res, next);
  }
});

challengeRouter.post("/challenge/attempts", async (req, res, next) => {
  try {
    res.status(201).json(await startAttempt(prisma, uid(req), startSchema.parse(req.body)));
  } catch (e) {
    fail(e, res, next);
  }
});

challengeRouter.post("/challenge/attempts/:id/finish", async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    res.json(await finishAttempt(prisma, uid(req), id, finishSchema.parse(req.body)));
  } catch (e) {
    fail(e, res, next);
  }
});

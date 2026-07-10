import { Router } from "express";
import bcrypt from "bcryptjs";
import { ProgressStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireAdmin } from "./auth.js";

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    display_name: z.string().trim().min(1).max(80).optional(),
    role: z.enum(["user", "admin"]).optional(),
    password: z.string().min(8).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Supply at least one field");

const progressSchema = z.object({
  status: z.enum(["locked", "unlocked", "completed"]),
  best_score: z.number().min(0).max(100).optional(),
});

const id = (value: unknown) => z.string().parse(value);

const lessonTitle = (lessonJson: unknown): string => {
  if (typeof lessonJson === "object" && lessonJson !== null && !Array.isArray(lessonJson)) {
    const title = (lessonJson as Record<string, unknown>).title;
    if (typeof title === "string") return title;
  }
  return "Unknown lesson";
};

/** All routes admin-only; mounted behind requireAuth. */
export const adminUsersRouter: Router = Router();
adminUsersRouter.use("/admin/users", requireAdmin);

adminUsersRouter.get("/admin/users", async (_req, res, next) => {
  try {
    const [users, totalLessons] = await Promise.all([
      prisma.user.findMany({
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          email: true,
          display_name: true,
          role: true,
          created_at: true,
          progress: { where: { status: ProgressStatus.completed }, select: { id: true } },
        },
      }),
      prisma.lesson.count(),
    ]);
    res.json({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        created_at: user.created_at.toISOString(),
        completed_lessons: user.progress.length,
        total_lessons: totalLessons,
      })),
    });
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.patch("/admin/users/:id", async (req, res, next) => {
  try {
    const input = updateUserSchema.parse(req.body);
    const { password, ...fields } = input;
    const data = {
      ...fields,
      ...(fields.email ? { email: fields.email.toLowerCase() } : {}),
      ...(password ? { password_hash: await bcrypt.hash(password, 12) } : {}),
    };
    const user = await prisma.user.update({
      where: { id: id(req.params.id) },
      data,
      select: { id: true, email: true, display_name: true, role: true },
    });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.delete("/admin/users/:id", async (req, res, next) => {
  try {
    const targetId = id(req.params.id);
    if (targetId === req.userId) {
      res.status(400).json({ error: { code: "cannot_delete_self", message: "You cannot delete your own account" } });
      return;
    }
    await prisma.user.delete({ where: { id: targetId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.get("/admin/users/:id/progress", async (req, res, next) => {
  try {
    const targetId = id(req.params.id);
    const [lessons, progress] = await Promise.all([
      prisma.lesson.findMany({ orderBy: { order: "asc" }, select: { id: true, order: true, lesson_json: true } }),
      prisma.userProgress.findMany({ where: { user_id: targetId } }),
    ]);
    const byLesson = new Map(progress.map((row) => [row.lesson_id, row]));
    res.json({
      progress: lessons.map((lesson) => {
        const row = byLesson.get(lesson.id);
        return {
          lesson_id: lesson.id,
          title: lessonTitle(lesson.lesson_json),
          order: lesson.order,
          status: row?.status ?? (lesson.order === 1 ? "unlocked" : "locked"),
          best_score: row?.best_score ?? 0,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.put("/admin/users/:id/progress/:lessonId", async (req, res, next) => {
  try {
    const targetId = id(req.params.id);
    const lessonId = id(req.params.lessonId);
    const input = progressSchema.parse(req.body);
    const completing = input.status === "completed";
    const row = await prisma.userProgress.upsert({
      where: { user_id_lesson_id: { user_id: targetId, lesson_id: lessonId } },
      create: {
        user_id: targetId,
        lesson_id: lessonId,
        status: input.status as ProgressStatus,
        best_score: input.best_score ?? 0,
        completed_at: completing ? new Date() : null,
      },
      update: {
        status: input.status as ProgressStatus,
        ...(input.best_score !== undefined ? { best_score: input.best_score } : {}),
        completed_at: completing ? new Date() : null,
      },
    });
    res.json({ lesson_id: row.lesson_id, status: row.status, best_score: row.best_score });
  } catch (e) {
    next(e);
  }
});

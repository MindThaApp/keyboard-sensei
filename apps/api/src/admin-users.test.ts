import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("./db.js", () => ({ prisma: prismaMock }));

import { adminUsersRouter } from "./admin-users.js";

async function callAdminUsersRouter(options: {
  method: string;
  url: string;
  userId: string;
  body?: unknown;
}) {
  return await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    let status = 200;
    let settled = false;
    const parsedUrl = new URL(options.url, "http://test.local");
    const req = {
      method: options.method,
      url: options.url,
      originalUrl: options.url,
      baseUrl: "",
      path: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams),
      params: {},
      headers: { "content-type": "application/json" },
      body: options.body,
      userId: options.userId,
    } as Request;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        settled = true;
        resolve({ status, body: payload });
        return this;
      },
    } as Response;

    (adminUsersRouter as unknown as (req: Request, res: Response, next: (error?: unknown) => void) => void)(
      req,
      res,
      (error?: unknown) => {
        if (error instanceof ZodError) {
          resolve({
            status: 400,
            body: { error: { code: "validation_error", message: "Request validation failed", details: error.flatten() } },
          });
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        if (!settled) {
          resolve({ status: 404, body: { error: { code: "not_found", message: `No route for ${options.method} ${options.url}` } } });
        }
      },
    );
  });
}

describe("POST /admin/users", () => {
  const validBody = { email: "New.User@Example.com", display_name: "New User", password: "supersecret" };

  it("creates a user and never returns the password hash", async () => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: "admin" });
    prismaMock.user.create.mockResolvedValueOnce({
      id: "user-new",
      email: "new.user@example.com",
      display_name: "New User",
      role: "user",
    });

    const response = await callAdminUsersRouter({
      method: "POST",
      url: "/admin/users",
      userId: "admin-1",
      body: validBody,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: "user-new", email: "new.user@example.com", display_name: "New User", role: "user" });
    expect(JSON.stringify(response.body)).not.toContain("password_hash");
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "new.user@example.com",
        display_name: "New User",
        role: "user",
        password_hash: expect.any(String),
      },
      select: { id: true, email: true, display_name: true, role: true },
    });
  });

  it("returns 409 email_taken on a duplicate email", async () => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: "admin" });
    prismaMock.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.10.1",
      }),
    );

    const response = await callAdminUsersRouter({
      method: "POST",
      url: "/admin/users",
      userId: "admin-1",
      body: validBody,
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { code: "email_taken", message: "A user with that email already exists" } });
  });

  it("rejects a password shorter than 8 characters", async () => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: "admin" });

    const response = await callAdminUsersRouter({
      method: "POST",
      url: "/admin/users",
      userId: "admin-1",
      body: { ...validBody, password: "short" },
    });

    expect(response.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("is admin-only", async () => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: "user" });

    const response = await callAdminUsersRouter({
      method: "POST",
      url: "/admin/users",
      userId: "user-1",
      body: validBody,
    });

    expect(response.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

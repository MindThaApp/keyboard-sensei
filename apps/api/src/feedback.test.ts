import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  feedback: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("./db.js", () => ({ prisma: prismaMock }));

import { feedbackRouter } from "./feedback.js";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const validPng = (): Buffer => Buffer.concat([PNG_HEADER, Buffer.alloc(100, 1)]);

async function callFeedbackRouter(options: {
  method: string;
  url: string;
  userId: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: Buffer;
}) {
  return await new Promise<{ status: number; body: unknown; headers: Record<string, string> }>((resolve, reject) => {
    let status = 200;
    let settled = false;
    const headers: Record<string, string> = {};
    const parsedUrl = new URL(options.url, "http://test.local");
    let sentRawBody = false;
    const req = new Readable({
      read() {
        if (sentRawBody || !options.rawBody) {
          this.push(null);
          return;
        }
        sentRawBody = true;
        this.push(options.rawBody);
        this.push(null);
      },
    }) as Request;
    Object.assign(req, {
      method: options.method,
      url: options.url,
      originalUrl: options.url,
      baseUrl: "",
      path: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams),
      params: {},
      headers: options.headers ?? {},
      body: options.body,
      userId: options.userId,
    });
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      set(name: string, value: string) {
        headers[name.toLowerCase()] = value;
        return this;
      },
      type(value: string) {
        headers["content-type"] = value;
        return this;
      },
      json(payload: unknown) {
        settled = true;
        resolve({ status, body: payload, headers });
        return this;
      },
      send(payload: unknown) {
        settled = true;
        resolve({ status, body: payload, headers });
        return this;
      },
    } as Response;

    (feedbackRouter as unknown as (req: Request, res: Response, next: (error?: unknown) => void) => void)(
      req,
      res,
      (error?: unknown) => {
        if (error instanceof ZodError) {
          resolve({
            status: 400,
            body: { error: { code: "validation_error", message: "Request validation failed", details: error.flatten() } },
            headers,
          });
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        if (!settled) {
          resolve({ status: 404, body: { error: { code: "not_found", message: `No route for ${options.method} ${options.url}` } }, headers });
        }
      },
    );
  });
}

describe("POST /feedback/:id/screenshot", () => {
  const ownRow = { id: "feedback-1", user_id: "user-1", screenshot: null };

  it("rejects bytes that don't sniff as a supported image format", async () => {
    vi.clearAllMocks();
    const response = await callFeedbackRouter({
      method: "POST",
      url: "/feedback/feedback-1/screenshot",
      userId: "user-1",
      headers: { "content-type": "image/png", "content-length": "4" },
      rawBody: Buffer.from([1, 2, 3, 4]),
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: { code: "invalid_image", message: "Screenshot must be a PNG, JPEG, or WEBP image" } });
    expect(prismaMock.feedback.update).not.toHaveBeenCalled();
  });

  it("rejects uploads over the 2MB limit even if the bytes are a valid image", async () => {
    vi.clearAllMocks();
    const oversized = Buffer.concat([PNG_HEADER, Buffer.alloc(2 * 1024 * 1024 + 1, 1)]);
    const response = await callFeedbackRouter({
      method: "POST",
      url: "/feedback/feedback-1/screenshot",
      userId: "user-1",
      headers: { "content-type": "image/png", "content-length": String(oversized.length) },
      rawBody: oversized,
    });

    expect(response.status).toBe(413);
    expect(prismaMock.feedback.update).not.toHaveBeenCalled();
  });

  it("will not let a user attach a screenshot to someone else's feedback", async () => {
    vi.clearAllMocks();
    prismaMock.feedback.findUnique.mockResolvedValueOnce({ ...ownRow, user_id: "someone-else" });

    const response = await callFeedbackRouter({
      method: "POST",
      url: "/feedback/feedback-1/screenshot",
      userId: "user-1",
      headers: { "content-type": "image/png", "content-length": String(validPng().length) },
      rawBody: validPng(),
    });

    expect(response.status).toBe(404);
    expect(prismaMock.feedback.update).not.toHaveBeenCalled();
  });

  it("ignores a spoofed Content-Type and sniffs real PNG magic bytes to accept the upload", async () => {
    vi.clearAllMocks();
    const bytes = validPng();
    prismaMock.feedback.findUnique.mockResolvedValueOnce(ownRow);
    prismaMock.feedback.update.mockResolvedValueOnce({ id: "feedback-1", screenshot: "feedback-feedback-1.png" });

    const response = await callFeedbackRouter({
      method: "POST",
      url: "/feedback/feedback-1/screenshot",
      userId: "user-1",
      headers: { "content-type": "text/plain", "content-length": String(bytes.length) },
      rawBody: bytes,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true });
    expect(prismaMock.feedback.update).toHaveBeenCalledWith({
      where: { id: "feedback-1" },
      data: { screenshot: "feedback-feedback-1.png" },
    });
  });
});

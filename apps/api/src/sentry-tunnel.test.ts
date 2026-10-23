import http, { type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSentryTunnelRouter, parseAllowedDsns, TUNNEL_MAX_BYTES } from "./sentry-tunnel.js";

const received: { url: string; type: string | undefined; body: Buffer; forwardedFor: string | undefined }[] = [];
let ingest: Server;
let tunnel: Server;
let tunnelUrl: string;
let ingestPort: number;

const listen = (server: Server) =>
  new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

const envelope = (dsn: string, extra = "") =>
  Buffer.from(`${JSON.stringify({ event_id: "abc", dsn })}\n{"type":"event"}\n{"message":"boom${extra}"}\n`);

const post = (body: Buffer | string) => fetch(tunnelUrl, { method: "POST", body: new Uint8Array(Buffer.from(body)) });

beforeAll(async () => {
  ingest = http.createServer(async (req, res) => {
    received.push({
      url: req.url ?? "",
      type: req.headers["content-type"],
      body: await readBody(req),
      forwardedFor: req.headers["x-forwarded-for"] as string | undefined,
    });
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  ingestPort = await listen(ingest);

  const allowed = parseAllowedDsns(
    `http://webkey@127.0.0.1:${ingestPort}/11, http://androidkey@127.0.0.1:${ingestPort}/22, garbage`,
  );
  const app = express();
  app.use(createSentryTunnelRouter(() => allowed));
  tunnel = http.createServer(app);
  tunnelUrl = `http://127.0.0.1:${await listen(tunnel)}/sentry-tunnel`;
});

afterAll(() => {
  ingest.close();
  tunnel.close();
});

describe("POST /sentry-tunnel", () => {
  it("forwards an envelope for a configured project, byte for byte, to the configured host", async () => {
    received.length = 0;
    const body = envelope(`http://webkey@127.0.0.1:${ingestPort}/11`);
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]!.url).toBe("/api/11/envelope/");
    expect(received[0]!.type).toBe("application/x-sentry-envelope");
    expect(received[0]!.body.equals(body)).toBe(true);
    // The client's address is not passed on.
    expect(received[0]!.forwardedFor).toBeUndefined();
  });

  it("accepts the second configured project too", async () => {
    received.length = 0;
    expect((await post(envelope(`http://androidkey@127.0.0.1:${ingestPort}/22`))).status).toBe(200);
    expect(received[0]!.url).toBe("/api/22/envelope/");
  });

  it("rejects a project id that is not configured", async () => {
    received.length = 0;
    const response = await post(envelope(`http://webkey@127.0.0.1:${ingestPort}/999`));
    expect(response.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it("rejects a foreign host, even with a configured project id and key", async () => {
    received.length = 0;
    expect((await post(envelope("https://webkey@o1.ingest.evil.example/11"))).status).toBe(403);
    expect((await post(envelope(`http://webkey@localhost:${ingestPort}/11`))).status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it("rejects a wrong public key", async () => {
    received.length = 0;
    expect((await post(envelope(`http://stolen@127.0.0.1:${ingestPort}/11`))).status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it("rejects bodies that are not envelopes", async () => {
    received.length = 0;
    expect((await post("")).status).toBe(403);
    expect((await post("hello")).status).toBe(403);
    expect((await post('{"no":"dsn"}\n')).status).toBe(403);
    expect((await post("\u0000\u0001\u0002")).status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it("never fetches a URL taken from the envelope", async () => {
    received.length = 0;
    const sneaky = Buffer.from(
      `${JSON.stringify({ dsn: `http://webkey@127.0.0.1:${ingestPort}/11`, url: "http://169.254.169.254/latest" })}\n`,
    );
    expect((await post(sneaky)).status).toBe(200);
    expect(received.map((item) => item.url)).toEqual(["/api/11/envelope/"]);
  });

  it("accepts envelopes up to the size limit and refuses larger ones", async () => {
    received.length = 0;
    const dsn = `http://webkey@127.0.0.1:${ingestPort}/11`;
    const header = envelope(dsn);
    const fits = Buffer.concat([header, Buffer.alloc(4 * 1024 * 1024, 0x61)]);
    expect((await post(fits)).status).toBe(200);
    const tooBig = Buffer.concat([header, Buffer.alloc(TUNNEL_MAX_BYTES + 1, 0x61)]);
    expect((await post(tooBig)).status).toBe(413);
    expect(received).toHaveLength(1);
  });

  it("answers 404 when no projects are configured", async () => {
    const app = express();
    app.use(createSentryTunnelRouter(() => []));
    const server = http.createServer(app);
    const port = await listen(server);
    const response = await fetch(`http://127.0.0.1:${port}/sentry-tunnel`, { method: "POST", body: "x" });
    server.close();
    expect(response.status).toBe(404);
  });
});

import { describe, expect, it } from "vitest";
import {
  parseSentryDsn,
  scrubBreadcrumb,
  scrubEvent,
  scrubString,
  sentryRelease,
} from "@keyboard-sensei/shared-types";

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTc2MTIwMDAwMH0.4Zr9mQe3b1vJ0m3x9v1k2Qk7Xw8sT5pYl2nH6aBcDeF";

describe("scrubString", () => {
  it("replaces email addresses", () => {
    expect(scrubString("Failed for ada.lovelace+test@example.co.uk today")).toBe("Failed for [email] today");
  });

  it("replaces JWTs and bearer credentials", () => {
    expect(scrubString(`token ${JWT} leaked`)).toBe("token [token] leaked");
    expect(scrubString(`Authorization: Bearer ${JWT}`)).toBe("Authorization: Bearer [token]");
    expect(scrubString("header was Bearer abcdef1234567890abcdef")).toBe("header was Bearer [token]");
    expect(scrubString("Basic dXNlcjpwYXNzd29yZA==")).toBe("Basic [token]");
  });

  it("redacts secret query parameters but keeps harmless ones", () => {
    const url = "https://ks.example/reset-password?token=9f8a7b6c5d4e&page=2&email=ada@example.com";
    expect(scrubString(url)).toBe("https://ks.example/reset-password?token=[redacted]&page=2&email=[redacted]");
    expect(scrubString("/auth/verify?code=123456")).toBe("/auth/verify?code=[redacted]");
  });

  it("redacts secrets written in free text", () => {
    expect(scrubString("bad token=abc123 and password: hunter2, ok")).toBe(
      "bad token=[redacted] and password: [redacted], ok",
    );
  });

  it("removes account names from file-system paths", () => {
    expect(scrubString("at run (/Users/ada/dev/Keyboard Sensei/apps/api/src/app.ts:12:3)")).not.toContain("ada");
    expect(scrubString("/home/ada/apps/keyboard-sensei/server.js")).toBe("/~/apps/keyboard-sensei/server.js");
    expect(scrubString("C:\\Users\\Ada Lovelace\\AppData\\x.js")).toBe("~\\AppData\\x.js");
    expect(scrubString("file:///data/user/0/com.keyboardsensei.app/files/a.mid")).toBe(
      "file:///data/app/files/a.mid",
    );
  });

  it("does not mistake a release name for an email", () => {
    expect(scrubString("keyboard-sensei@0.1.0+9451eecabcde")).toBe("keyboard-sensei@0.1.0+9451eecabcde");
  });

  it("leaves ordinary text alone", () => {
    expect(scrubString("TypeError: cannot read properties of undefined (reading 'note')")).toBe(
      "TypeError: cannot read properties of undefined (reading 'note')",
    );
  });
});

describe("scrubEvent", () => {
  const event = {
    event_id: "0123456789abcdef0123456789abcdef",
    message: "Login failed for ada@example.com",
    server_name: "adas-macbook.local",
    user: { id: "user-1", email: "ada@example.com", username: "ada", ip_address: "203.0.113.9" },
    request: {
      url: `https://ks.example/app?access_token=${JWT}`,
      query_string: "token=abc123&x=1",
      cookies: { session: "s3cr3t" },
      data: { password: "hunter2" },
      headers: {
        Authorization: `Bearer ${JWT}`,
        Cookie: "sid=1",
        "User-Agent": "Mozilla/5.0",
        "X-Forwarded-For": "203.0.113.9",
      },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: "ENOENT /Users/ada/secret.mid",
          stacktrace: { frames: [{ filename: "/Users/ada/dev/ks/apps/api/src/app.ts", lineno: 4 }] },
        },
      ],
    },
    contexts: { device: { name: "Ada's Pixel", model: "Pixel 8" } },
    extra: { password: "hunter2", note: "mail me at bob@example.org" },
  };

  const scrubbed = scrubEvent(event);
  const text = JSON.stringify(scrubbed);

  it("leaves no email, token, password, path user or IP anywhere in the event", () => {
    for (const secret of ["ada@example.com", "bob@example.org", JWT, "hunter2", "s3cr3t", "203.0.113.9", "adas-macbook", "/Users/ada", "abc123"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("keeps only the internal user id", () => {
    expect(scrubbed.user).toEqual({ id: "user-1" });
    expect(scrubEvent({ user: { email: "ada@example.com" } }).user).toBeUndefined();
  });

  it("keeps useful, harmless fields", () => {
    expect(scrubbed.event_id).toBe(event.event_id);
    expect(scrubbed.request.headers).toEqual({ "User-Agent": "Mozilla/5.0" });
    expect(scrubbed.contexts.device).toEqual({ model: "Pixel 8" });
    expect(scrubbed.exception.values[0].stacktrace.frames[0].lineno).toBe(4);
  });

  it("does not modify its input", () => {
    expect(event.user.email).toBe("ada@example.com");
  });
});

describe("scrubBreadcrumb", () => {
  it("scrubs messages and data", () => {
    const crumb = scrubBreadcrumb({
      category: "fetch",
      message: "GET /auth/verify-email?token=abc",
      data: { url: "https://x/y?token=zzz", headers: { authorization: `Bearer ${JWT}` } },
    });
    expect(JSON.stringify(crumb)).not.toMatch(/abc|zzz|eyJ/);
  });
});

describe("release and DSN helpers", () => {
  it("builds the release name", () => {
    expect(sentryRelease("0.1.0", "9451eecabcdef0123456789")).toBe("keyboard-sensei@0.1.0+9451eecabcde");
    expect(sentryRelease("0.1.0", undefined)).toBe("keyboard-sensei@0.1.0+dev");
  });

  it("parses DSNs", () => {
    expect(parseSentryDsn("https://abc123@o1.ingest.de.sentry.io/456")).toEqual({
      protocol: "https",
      publicKey: "abc123",
      host: "o1.ingest.de.sentry.io",
      projectId: "456",
    });
    expect(parseSentryDsn("not a dsn")).toBeNull();
    expect(parseSentryDsn("https://o1.ingest.de.sentry.io/456")).toBeNull();
  });
});

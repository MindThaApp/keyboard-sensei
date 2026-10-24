import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMonitoring, RECENT_ERROR_MS, type MonitoringConfig, type SentryLike } from "./client";
import { CONSENT_STORAGE_KEY, defaultConsent, onConsentChange, readConsent, writeConsent } from "./consent";

type Hook = (event: Record<string, unknown>) => void;

function fakeSdk() {
  let feedbackHook: Hook | undefined;
  let options: Record<string, any> = {};
  const sdk = {
    init: vi.fn(),
    close: vi.fn(async () => true),
    captureException: vi.fn(() => "evt"),
    captureFeedback: vi.fn<SentryLike["captureFeedback"]>(() => "fb"),
    lastEventId: vi.fn(() => "last-event-id"),
    setUser: vi.fn(),
    getClient: () => ({ on: (_hook: "beforeSendFeedback", cb: Hook) => void (feedbackHook = cb) }),
  } satisfies SentryLike;
  const load = vi.fn(async () => ({
    sdk,
    init: (initOptions: Record<string, unknown>) => {
      options = initOptions;
      sdk.init(initOptions);
    },
  }));
  return { sdk, load, options: () => options, feedbackHook: () => feedbackHook };
}

const config = (overrides: Partial<MonitoringConfig> = {}): MonitoringConfig => ({
  dsn: "https://key@o1.ingest.de.sentry.io/1",
  release: "keyboard-sensei@0.1.0+abc",
  environment: "production",
  tunnel: "/api/sentry-tunnel",
  tracesSampleRate: 0,
  native: false,
  ...overrides,
});

describe("crash-reporting consent", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to on for the website and ask for the Android app", () => {
    expect(defaultConsent(false)).toBe("always");
    expect(defaultConsent(true)).toBe("ask");
    expect(readConsent(false)).toBe("always");
    expect(readConsent(true)).toBe("ask");
  });

  it("stores the choice per device and notifies listeners", () => {
    const seen: string[] = [];
    const off = onConsentChange((value) => seen.push(value));
    writeConsent("never");
    off();
    writeConsent("always");
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("always");
    expect(readConsent(false)).toBe("always");
    expect(seen).toEqual(["never"]);
  });

  it("ignores junk in storage", () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, "maybe");
    expect(readConsent(true)).toBe("ask");
  });
});

describe("monitoring lifecycle", () => {
  it("does nothing without a DSN", async () => {
    const { load } = fakeSdk();
    const monitoring = createMonitoring(config({ dsn: undefined }), { load });
    await monitoring.apply("always");
    expect(monitoring.configured).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("does not load the SDK until the choice is 'always'", async () => {
    const { load } = fakeSdk();
    const monitoring = createMonitoring(config(), { load });
    await monitoring.apply("ask");
    await monitoring.apply("never");
    expect(load).not.toHaveBeenCalled();
    await monitoring.apply("always");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("initialises once with privacy-first options, then closes when consent is withdrawn", async () => {
    const { sdk, load, options } = fakeSdk();
    const monitoring = createMonitoring(config(), { load });
    await Promise.all([monitoring.apply("always"), monitoring.apply("always")]);
    await monitoring.apply("always");
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(options()).toMatchObject({
      dsn: "https://key@o1.ingest.de.sentry.io/1",
      release: "keyboard-sensei@0.1.0+abc",
      environment: "production",
      tunnel: "/api/sentry-tunnel",
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
    await monitoring.apply("never");
    expect(sdk.close).toHaveBeenCalledTimes(1);
    expect(options().beforeSend({ message: "x" })).toBeNull();
  });

  it("redacts events and breadcrumbs, and drops the BrowserSession integration", async () => {
    const { load, options } = fakeSdk();
    await createMonitoring(config(), { load }).apply("always");
    const event = options().beforeSend({
      message: "failed for ada@example.com at /Users/ada/x.ts",
      user: { id: "u1", email: "ada@example.com" },
    });
    expect(JSON.stringify(event)).not.toMatch(/ada@|\/Users\/ada/);
    expect(event.user).toEqual({ id: "u1" });
    expect(options().beforeBreadcrumb({ message: "GET /x?token=abc" }).message).toBe("GET /x?token=[redacted]");
    const kept = options().integrations([{ name: "BrowserSession" }, { name: "GlobalHandlers" }]);
    expect(kept).toEqual([{ name: "GlobalHandlers" }]);
  });

  it("redacts feedback events in place", async () => {
    const { load, feedbackHook } = fakeSdk();
    await createMonitoring(config(), { load }).apply("always");
    const event: Record<string, any> = {
      contexts: { feedback: { message: "mail me at ada@example.com" } },
      user: { id: "u1", email: "ada@example.com" },
    };
    feedbackHook()!(event);
    expect(JSON.stringify(event)).not.toContain("ada@");
    expect(event.user).toEqual({ id: "u1" });
  });

  it("attaches the internal user id only", async () => {
    const { sdk, load } = fakeSdk();
    const monitoring = createMonitoring(config(), { load });
    monitoring.setUser("user-7");
    await monitoring.apply("always");
    expect(sdk.setUser).toHaveBeenCalledWith({ id: "user-7" });
    monitoring.setUser(null);
    expect(sdk.setUser).toHaveBeenLastCalledWith(null);
  });
});

describe("feedback to Sentry", () => {
  const report = { message: "It broke", category: "bug", feedbackId: "fb-1", page: "/play", experienceMode: "simple" };

  it("sends nothing while monitoring is off", async () => {
    const { sdk, load } = fakeSdk();
    await createMonitoring(config(), { load }).reportFeedback(report);
    expect(sdk.captureFeedback).not.toHaveBeenCalled();
  });

  it("sends one feedback event with category and our feedback id, and no attachment or event link", async () => {
    const { sdk, load } = fakeSdk();
    const monitoring = createMonitoring(config(), { load });
    await monitoring.apply("always");
    await monitoring.reportFeedback(report);
    expect(sdk.captureFeedback).toHaveBeenCalledTimes(1);
    const [params, hint] = sdk.captureFeedback.mock.calls[0]!;
    expect(params).toMatchObject({ message: "It broke", url: "/play" });
    expect(params.associatedEventId).toBeUndefined();
    expect(params).not.toHaveProperty("email");
    expect(hint).toBeUndefined();
  });

  it("tags the feedback with kind, route, experience mode, platform and app version", async () => {
    const { sdk, load } = fakeSdk();
    const monitoring = createMonitoring(config(), { load });
    await monitoring.apply("always");
    await monitoring.reportFeedback({ ...report, experienceMode: "advanced" });
    expect(sdk.captureFeedback.mock.calls[0]![0].tags).toEqual({
      feedback_kind: "bug",
      feedback_id: "fb-1",
      route: "/play",
      experience_mode: "advanced",
      platform: "web",
      app_version: config().release,
    });
  });

  it("reports the android platform for the native app", async () => {
    const { sdk, load } = fakeSdk();
    const monitoring = createMonitoring({ ...config(), native: true }, { load });
    await monitoring.apply("always");
    await monitoring.reportFeedback(report);
    expect(sdk.captureFeedback.mock.calls[0]![0].tags?.platform).toBe("android");
  });

  it("includes the contact email only when one was given", async () => {
    const { sdk, load } = fakeSdk();
    const monitoring = createMonitoring(config(), { load });
    await monitoring.apply("always");
    await monitoring.reportFeedback({ ...report, email: "ada@example.com" });
    expect(sdk.captureFeedback.mock.calls[0]![0].email).toBe("ada@example.com");
  });

  it("keeps the contact email through redaction while still redacting emails in the message", async () => {
    const { load, feedbackHook } = fakeSdk();
    await createMonitoring(config(), { load }).apply("always");
    const event: Record<string, unknown> = {
      contexts: { feedback: { message: "mail bob@example.com", contact_email: "ada@example.com" } },
      user: { id: "u1", email: "acct@example.com" },
    };
    feedbackHook()!(event);
    expect(event.contexts).toEqual({ feedback: { message: "mail [email]", contact_email: "ada@example.com" } });
    expect(event.user).toEqual({ id: "u1" });
  });

  it("links to the last error when there was one recently, and not when it is old", async () => {
    let clock = 1_000_000;
    const { sdk, load, options } = fakeSdk();
    const monitoring = createMonitoring(config(), { load }, () => clock);
    await monitoring.apply("always");
    options().beforeSend({ message: "boom" });
    clock += 60_000;
    await monitoring.reportFeedback(report);
    expect(sdk.captureFeedback.mock.calls[0]![0].associatedEventId).toBe("last-event-id");
    clock += RECENT_ERROR_MS;
    await monitoring.reportFeedback(report);
    expect(sdk.captureFeedback.mock.calls[1]![0].associatedEventId).toBeUndefined();
  });

  it("attaches the screenshot only when the user chose one", async () => {
    const { sdk, load } = fakeSdk();
    const monitoring = createMonitoring(config(), { load });
    await monitoring.apply("always");
    await monitoring.reportFeedback({ ...report, screenshot: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) });
    const hint = sdk.captureFeedback.mock.calls[0]![1];
    expect(hint?.attachments).toHaveLength(1);
    expect(hint?.attachments?.[0]).toMatchObject({ filename: "screenshot.png", contentType: "image/png" });
    expect(Array.from(hint!.attachments![0]!.data)).toEqual([1, 2, 3]);
  });

  it("sends the original image where it cannot be re-encoded", async () => {
    const { sdk, load } = fakeSdk();
    const monitoring = createMonitoring(config(), { load });
    await monitoring.apply("always");
    await monitoring.reportFeedback({ ...report, screenshot: new Blob([new Uint8Array([9])], { type: "image/webp" }) });
    expect(sdk.captureFeedback.mock.calls[0]![1]?.attachments?.[0]).toMatchObject({ filename: "screenshot.webp" });
  });

  it("never throws into the feedback form", async () => {
    const { sdk, load } = fakeSdk();
    sdk.captureFeedback.mockImplementation(() => {
      throw new Error("sdk broke");
    });
    const monitoring = createMonitoring(config(), { load });
    await monitoring.apply("always");
    await expect(monitoring.reportFeedback(report)).resolves.toBeUndefined();
  });
});

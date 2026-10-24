// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitFeedback = vi.fn();
const submitFeedbackWithScreenshot = vi.fn();
const reportFeedback = vi.fn();

vi.mock("../../services/api", () => ({
  submitFeedback: (...args: unknown[]) => submitFeedback(...args),
  submitFeedbackWithScreenshot: (...args: unknown[]) => submitFeedbackWithScreenshot(...args),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ authenticated: true, user: { id: "u1", email: "acct@example.com" } }),
}));
vi.mock("../../contexts/ExperienceContext", () => ({ useExperienceMode: () => "advanced" }));
vi.mock("../../monitoring", () => ({
  monitoring: { reportFeedback: (...args: unknown[]) => reportFeedback(...args) },
}));

import FeedbackWidget from "./FeedbackWidget";

function renderWidget() {
  return render(
    <MemoryRouter initialEntries={["/play"]}>
      <FeedbackWidget open onOpenChange={() => undefined} />
    </MemoryRouter>,
  );
}

async function typeAndSend(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your feedback"), "It broke");
  await user.click(screen.getByRole("button", { name: "Send feedback" }));
}

describe("FeedbackWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitFeedback.mockResolvedValue({ id: "fb-1" });
    reportFeedback.mockResolvedValue(undefined);
  });

  it("sends to our API and to Sentry, with no email unless opted in", async () => {
    const user = userEvent.setup();
    renderWidget();
    await typeAndSend(user);
    await screen.findByText("Thanks! Feedback sent.");
    expect(submitFeedback).toHaveBeenCalledWith("bug", "It broke", "/play");
    expect(reportFeedback).toHaveBeenCalledTimes(1);
    const report = reportFeedback.mock.calls[0]![0];
    expect(report).toMatchObject({ message: "It broke", category: "bug", feedbackId: "fb-1", page: "/play", experienceMode: "advanced" });
    expect(report.email).toBeUndefined();
    expect(report.screenshot).toBeFalsy();
  });

  it("includes the account email only when the box is ticked", async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByLabelText(/Include my account email/));
    await typeAndSend(user);
    await waitFor(() => expect(reportFeedback).toHaveBeenCalled());
    expect(reportFeedback.mock.calls[0]![0].email).toBe("acct@example.com");
  });

  it("prefers an address the user typed", async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.type(screen.getByLabelText("Email for a reply (optional)"), "ada@example.com");
    await typeAndSend(user);
    await waitFor(() => expect(reportFeedback).toHaveBeenCalled());
    expect(reportFeedback.mock.calls[0]![0].email).toBe("ada@example.com");
  });

  it("passes the screenshot only when one was attached", async () => {
    submitFeedbackWithScreenshot.mockResolvedValue({ ok: true, id: "fb-2" });
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    renderWidget();
    const file = new File([new Uint8Array([1])], "s.png", { type: "image/png" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    await typeAndSend(user);
    await waitFor(() => expect(reportFeedback).toHaveBeenCalled());
    expect(submitFeedbackWithScreenshot).toHaveBeenCalled();
    expect(reportFeedback.mock.calls[0]![0].screenshot).toBe(file);
  });

  it("still shows the API error and does not report to Sentry when the API fails", async () => {
    submitFeedback.mockRejectedValue(new Error("Server said no"));
    const user = userEvent.setup();
    renderWidget();
    await typeAndSend(user);
    expect((await screen.findByRole("alert")).textContent).toBe("Server said no");
    expect(reportFeedback).not.toHaveBeenCalled();
  });

  it("swallows Sentry failures, sync or async, and still confirms the send", async () => {
    const failures = [
      () => Promise.reject(new Error("sentry down")),
      () => {
        throw new Error("sentry broke");
      },
    ];
    for (const failure of failures) {
      reportFeedback.mockImplementation(failure);
      const user = userEvent.setup();
      const { unmount } = renderWidget();
      await typeAndSend(user);
      await screen.findByText("Thanks! Feedback sent.");
      expect(screen.queryByRole("alert")).toBeNull();
      unmount();
    }
  });
});

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { submitFeedback, submitFeedbackWithScreenshot, type FeedbackType } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { monitoring } from "../../monitoring";
import { Button } from "../ui/Button";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Sheet } from "../ui/Sheet";
import "../shell/shell.css";

const TYPES: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
];

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

interface FeedbackWidgetProps {
  /** Controlled open state. Omit both open/onOpenChange to let the widget manage it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Shows the floating launcher button. Off by default: it covered primary actions on
   *  phones, so feedback is reached from the account menu; only admins get the button. */
  showLauncher?: boolean;
}

/**
 * Feedback sheet, opened from the account menu (or the admin launcher). Submitting
 * requires a logged-in session (the API route is authed); signed out, the sheet
 * explains that instead of failing.
 */
export default function FeedbackWidget({ open: controlledOpen, onOpenChange, showLauncher = false }: FeedbackWidgetProps = {}) {
  const { authenticated } = useAuth();
  const location = useLocation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setState("idle");
    setError(null);
    removeScreenshot();
  };

  const removeScreenshot = () => {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshot(null);
    setScreenshotPreview(null);
  };

  const pickScreenshot = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Screenshot must be an image");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError("Screenshot must be 2MB or smaller");
      return;
    }
    setError(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const send = async () => {
    if (!message.trim()) return;
    setState("sending");
    setError(null);
    try {
      const text = message.trim();
      const { id } = screenshot
        ? await submitFeedbackWithScreenshot(type, text, location.pathname, screenshot)
        : await submitFeedback(type, text, location.pathname);
      // Saved on our server; also hand it to the error monitor (a no-op when it is off).
      void monitoring.reportFeedback({ message: text, category: type, feedbackId: id, page: location.pathname, screenshot });
      setState("sent");
      setMessage("");
      removeScreenshot();
      setTimeout(close, 1200);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not send feedback");
    }
  };

  return (
    <>
      <Sheet open={open} onClose={close} title="Send feedback" detents={["medium", "large"]}>
        <div className="ks-feedback" aria-label="Send feedback">
          {!authenticated ? (
            <p className="ks-feedback__note">Log in to send feedback or report an issue.</p>
          ) : state === "sent" ? (
            <p role="status" className="ks-feedback__note">Thanks! Feedback sent.</p>
          ) : (
            <>
              <SegmentedControl<FeedbackType>
                aria-label="Feedback type"
                block
                options={TYPES}
                value={type}
                onChange={(next) => next && setType(next)}
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                aria-label="Your feedback"
                placeholder={type === "bug" ? "What went wrong? What did you expect?" : "Tell us what's on your mind…"}
                className="ks-feedback__text"
              />
              {screenshotPreview ? (
                <div className="ks-feedback__thumb">
                  <img src={screenshotPreview} alt="Screenshot preview" />
                  <Button variant="plain" size="sm" onClick={removeScreenshot}>
                    Remove screenshot
                  </Button>
                </div>
              ) : (
                <label className="ks-feedback__note">
                  Attach a screenshot
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => pickScreenshot(e.target.files?.[0])}
                    className="mt-1 block w-full text-xs"
                  />
                </label>
              )}
              {error && (
                <p role="alert" className="ks-feedback__error">{error}</p>
              )}
              <Button
                variant="filled"
                size="lg"
                loading={state === "sending"}
                disabled={!message.trim()}
                onClick={() => void send()}
              >
                {state === "sending" ? "Sending…" : "Send feedback"}
              </Button>
            </>
          )}
        </div>
      </Sheet>
      {showLauncher && (
        <div className="ks-feedback-launcher">
          <Button variant="tinted" onClick={() => setOpen(true)} aria-haspopup="dialog">
            Feedback
          </Button>
        </div>
      )}
    </>
  );
}

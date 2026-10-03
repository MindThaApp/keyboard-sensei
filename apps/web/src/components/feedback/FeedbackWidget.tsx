import { useState } from "react";
import { useLocation } from "react-router-dom";
import { submitFeedback, submitFeedbackWithScreenshot, type FeedbackType } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";

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
  /** False hides the floating launcher button — used on the Play-Along stage, where it
   *  sat on top of the keyboard; the header offers a Feedback button there instead. */
  showLauncher?: boolean;
}

/**
 * Floating feedback button rendered in the app shell so it appears on every
 * page. Submitting requires a logged-in session (the API route is authed);
 * on auth pages the dialog explains that instead of failing.
 */
export default function FeedbackWidget({ open: controlledOpen, onOpenChange, showLauncher = true }: FeedbackWidgetProps = {}) {
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
      if (screenshot) {
        await submitFeedbackWithScreenshot(type, message.trim(), location.pathname, screenshot);
      } else {
        await submitFeedback(type, message.trim(), location.pathname);
      }
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
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <section aria-label="Send feedback" className="card w-72 space-y-3 p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Feedback</h2>
            <button aria-label="Close feedback" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={close}>
              ✕
            </button>
          </div>
          {!authenticated ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Log in to send feedback or report an issue.</p>
          ) : state === "sent" ? (
            <p className="text-sm font-medium text-brass-600 dark:text-brass-400">Thanks! Feedback sent.</p>
          ) : (
            <>
              <div className="flex gap-1" role="radiogroup" aria-label="Feedback type">
                {TYPES.map((item) => (
                  <button
                    key={item.value}
                    role="radio"
                    aria-checked={type === item.value}
                    onClick={() => setType(item.value)}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      type === item.value
                        ? "bg-felt-600 font-medium text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={type === "bug" ? "What went wrong? What did you expect?" : "Tell us what's on your mind…"}
                className="w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600"
              />
              {screenshotPreview ? (
                <div className="flex items-center gap-2">
                  <img src={screenshotPreview} alt="Screenshot preview" className="h-14 w-14 rounded object-cover" />
                  <button
                    type="button"
                    onClick={removeScreenshot}
                    className="text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Remove screenshot
                  </button>
                </div>
              ) : (
                <label className="block text-xs text-slate-500 dark:text-slate-400">
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
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
              )}
              <button
                className="primary-button w-full text-sm"
                disabled={state === "sending" || !message.trim()}
                onClick={() => void send()}
              >
                {state === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </>
          )}
        </section>
      )}
      {showLauncher && (
        <button
          onClick={() => (open ? close() : setOpen(true))}
          className="rounded-full bg-felt-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-felt-700"
          aria-expanded={open}
        >
          💬 Feedback
        </button>
      )}
    </div>
  );
}

import { t, useT } from "../../i18n";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { submitFeedback, submitFeedbackWithScreenshot, type FeedbackType } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { useExperienceMode } from "../../contexts/ExperienceContext";
import { monitoring } from "../../monitoring";
import { Button } from "../ui/Button";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Sheet } from "../ui/Sheet";
import "../shell/shell.css";

const typeOptions = (): { value: FeedbackType; label: string }[] => [
  { value: "bug", label: t("feedback.bug") },
  { value: "idea", label: t("feedback.idea") },
  { value: "other", label: t("feedback.other") },
];

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  useT();
  const { authenticated, user } = useAuth();
  const experienceMode = useExperienceMode();
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
  const [contactEmail, setContactEmail] = useState("");
  const [includeAccountEmail, setIncludeAccountEmail] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setState("idle");
    setError(null);
    removeScreenshot();
    setContactEmail("");
    setIncludeAccountEmail(false);
  };

  const removeScreenshot = () => {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshot(null);
    setScreenshotPreview(null);
  };

  const pickScreenshot = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("feedback.notImage"));
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError(t("feedback.tooBig"));
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
      // Fire and forget: the API result alone decides what the user sees.
      try {
        const typed = contactEmail.trim();
        const email = EMAIL_SHAPE.test(typed) ? typed : includeAccountEmail ? user?.email : undefined;
        void monitoring
          .reportFeedback({ message: text, category: type, feedbackId: id, page: location.pathname, experienceMode, email, screenshot })
          .catch(() => undefined);
      } catch {
        // Ignored on purpose; see above.
      }
      setState("sent");
      setMessage("");
      removeScreenshot();
      setTimeout(close, 1200);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : t("feedback.sendFailed"));
    }
  };

  return (
    <>
      <Sheet open={open} onClose={close} title={t("feedback.title")} detents={["medium", "large"]}>
        <div className="ks-feedback" aria-label={t("feedback.title")}>
          {!authenticated ? (
            <p className="ks-feedback__note">{t("feedback.logIn")}</p>
          ) : state === "sent" ? (
            <p role="status" className="ks-feedback__note">{t("feedback.thanks")}</p>
          ) : (
            <>
              <SegmentedControl<FeedbackType>
                aria-label={t("feedback.type")}
                block
                options={typeOptions()}
                value={type}
                onChange={(next) => next && setType(next)}
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                aria-label={t("feedback.your")}
                placeholder={type === "bug" ? t("feedback.phBug") : t("feedback.phOther")}
                className="ks-feedback__text"
              />
              {screenshotPreview ? (
                <div className="ks-feedback__thumb">
                  <img src={screenshotPreview} alt={t("feedback.screenshotAlt")} />
                  <Button variant="plain" size="sm" onClick={removeScreenshot}>
                    {t("feedback.removeShot")}
                  </Button>
                </div>
              ) : (
                <label className="ks-feedback__note">
                  {t("feedback.attach")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => pickScreenshot(e.target.files?.[0])}
                    className="mt-1 block w-full text-xs"
                  />
                </label>
              )}
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                aria-label={t("feedback.emailReply")}
                placeholder={t("feedback.emailReply")}
                autoComplete="off"
                className="ks-feedback__text"
                style={{ minHeight: 0 }}
              />
              {user?.email && (
                <label className="ks-feedback__note">
                  <input
                    type="checkbox"
                    checked={includeAccountEmail}
                    onChange={(e) => setIncludeAccountEmail(e.target.checked)}
                  />{" "}
                  {t("feedback.includeEmail")}
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
                {state === "sending" ? t("auth.recover.sending") : t("feedback.title")}
              </Button>
            </>
          )}
        </div>
      </Sheet>
      {showLauncher && (
        <div className="ks-feedback-launcher">
          <Button variant="tinted" onClick={() => setOpen(true)} aria-haspopup="dialog">
            {t("feedback.launcher")}
          </Button>
        </div>
      )}
    </>
  );
}

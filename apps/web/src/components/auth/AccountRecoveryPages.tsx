import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import * as api from "../../services/api";
import PublicPageLayout from "../legal/PublicPageLayout";

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`text-sm ${tone === "error" ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}
    >
      {children}
    </p>
  );
}

/** Asks for an email and always answers the same way, whether or not it has an account. */
export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicPageLayout title="Forgot your password?">
      <div className="card max-w-md space-y-4 p-5">
        {sent ? (
          <>
            <Notice tone="ok">
              If an account uses {email}, we've sent it a link to choose a new password. The link works once and expires in
              30 minutes.
            </Notice>
            <p className="text-sm text-slate-600 dark:text-slate-300">Nothing arrived? Check your spam folder, or try again in a few minutes.</p>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Enter the email you signed up with and we'll send you a reset link.</p>
            <input
              aria-label="Email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <Notice tone="error">{error}</Notice>}
            <button type="submit" className="primary-button w-full" disabled={busy || !email}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <Link to="/" className="block text-sm text-felt-700 underline dark:text-felt-300">
          Back to sign in
        </Link>
      </div>
    </PublicPageLayout>
  );
}

/** The emailed link lands here: /reset-password?token=… */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = repeat.length > 0 && repeat !== password;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset the password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicPageLayout title="Choose a new password">
      <div className="card max-w-md space-y-4 p-5">
        {!token ? (
          <Notice tone="error">
            This link is missing its token. Open the link from the email again, or <Link to="/forgot-password">request a new one</Link>.
          </Notice>
        ) : done ? (
          <>
            <Notice tone="ok">Your password has been changed.</Notice>
            <Link to="/" className="primary-button inline-block">
              Sign in
            </Link>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <input
              aria-label="New password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="New password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              aria-label="Repeat new password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat new password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
            {mismatch && <Notice tone="error">The passwords don't match.</Notice>}
            {error && (
              <Notice tone="error">
                {error} <Link to="/forgot-password">Request a new link</Link>
              </Notice>
            )}
            <button type="submit" className="primary-button w-full" disabled={busy || password.length < 8 || password !== repeat}>
              {busy ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </PublicPageLayout>
  );
}

/** The confirmation link lands here: /verify-email?token=… — confirming signs you in. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(token ? null : "This link is missing its token. Open the link from the email again.");
  // Tokens are single-use: redeem once even though StrictMode mounts effects twice.
  const redeeming = useRef<string | null>(null);

  useEffect(() => {
    if (!token || redeeming.current === token) return;
    redeeming.current = token;
    api
      .verifyEmail(token)
      .then((session) => {
        acceptSession(session);
        // A new account goes through onboarding, like any other sign-up.
        navigate("/welcome/assessment?from=signup", { replace: true });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not confirm the email"));
  }, [token, acceptSession, navigate]);

  return (
    <PublicPageLayout title="Confirming your email">
      <div className="card max-w-md space-y-4 p-5">
        {error ? (
          <>
            <Notice tone="error">{error}</Notice>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Sign in to send a new confirmation link. <Link to="/">Go to sign in</Link>
            </p>
          </>
        ) : (
          <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
            One moment…
          </p>
        )}
      </div>
    </PublicPageLayout>
  );
}

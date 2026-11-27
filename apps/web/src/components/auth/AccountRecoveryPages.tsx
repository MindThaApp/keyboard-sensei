import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { t, tRich, useT } from "../../i18n";
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
  useT();
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
      setError(e instanceof Error ? e.message : t("auth.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicPageLayout title={t("auth.recover.title")}>
      <div className="card max-w-md space-y-4 p-5">
        {sent ? (
          <>
            <Notice tone="ok">
              {t("auth.recover.sent", { email })}
            </Notice>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("auth.recover.spam")}</p>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("auth.recover.prompt")}</p>
            <input
              aria-label={t("common.email")}
              className="input"
              type="email"
              autoComplete="email"
              placeholder={t("common.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <Notice tone="error">{error}</Notice>}
            <button type="submit" className="primary-button w-full" disabled={busy || !email}>
              {busy ? t("auth.recover.sending") : t("auth.recover.send")}
            </button>
          </form>
        )}
        <Link to="/" className="block text-sm text-felt-700 underline dark:text-felt-300">
          {t("auth.backToSignIn")}
        </Link>
      </div>
    </PublicPageLayout>
  );
}

/** The emailed link lands here: /reset-password?token=… */
export function ResetPasswordPage() {
  useT();
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
    <PublicPageLayout title={t("auth.reset.title")}>
      <div className="card max-w-md space-y-4 p-5">
        {!token ? (
          <Notice tone="error">
            {tRich("auth.reset.missingToken", { link: (c) => <Link to="/forgot-password">{c}</Link> })}
          </Notice>
        ) : done ? (
          <>
            <Notice tone="ok">{t("auth.reset.done")}</Notice>
            <Link to="/" className="primary-button inline-block">
              {t("auth.signIn")}
            </Link>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <input
              aria-label={t("auth.newPassword")}
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={t("auth.newPasswordHint")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              aria-label={t("auth.repeatPassword")}
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={t("auth.repeatPassword")}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
            {mismatch && <Notice tone="error">{t("auth.mismatch")}</Notice>}
            {error && (
              <Notice tone="error">
                {error} <Link to="/forgot-password">{t("auth.requestNewLink")}</Link>
              </Notice>
            )}
            <button type="submit" className="primary-button w-full" disabled={busy || password.length < 8 || password !== repeat}>
              {busy ? t("auth.saving") : t("auth.setPassword")}
            </button>
          </form>
        )}
      </div>
    </PublicPageLayout>
  );
}

/** The confirmation link lands here: /verify-email?token=… — confirming signs you in. */
export function VerifyEmailPage() {
  useT();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(token ? null : t("auth.verify.missingToken"));
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
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("auth.verify.failed")));
  }, [token, acceptSession, navigate]);

  return (
    <PublicPageLayout title={t("auth.verify.title")}>
      <div className="card max-w-md space-y-4 p-5">
        {error ? (
          <>
            <Notice tone="error">{error}</Notice>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("auth.verify.signInHint")} <Link to="/">{t("auth.verify.goSignIn")}</Link>
            </p>
          </>
        ) : (
          <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
            {t("auth.oneMoment")}
          </p>
        )}
      </div>
    </PublicPageLayout>
  );
}

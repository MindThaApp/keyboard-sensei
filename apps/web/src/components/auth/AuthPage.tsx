import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { t, tRich, useT } from "../../i18n";
import { useAuth } from "../../contexts/AuthContext";
import * as api from "../../services/api";
import Wordmark from "../brand/Wordmark";
import { LegalLinks } from "../legal/PublicPageLayout";
import { useServerConfig } from "../../services/serverConfig";
import GoogleSignInButton, { googleSignInEnabled } from "./GoogleSignInButton";

type EntryKind = "demo" | "signup" | "login";

/** "or" rule plus the Google button; nothing at all until Google sign-in is configured. */
function GoogleOption({ onSignedIn }: { onSignedIn(created: boolean): void }) {
  useT();
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (!googleSignInEnabled) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <GoogleSignInButton
        onCredential={(credential) => {
          setError(null);
          loginWithGoogle(credential)
            .then(onSignedIn)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : t("auth.googleFailed")));
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

/** Shown instead of a session when the server requires a confirmed email. */
function CheckYourEmail({ email }: { email: string }) {
  useT();
  const [resent, setResent] = useState(false);
  return (
    <div role="status" className="space-y-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
      <p>
        {tRich("auth.checkEmail", { email, strong: (c) => <strong>{c}</strong> })}
      </p>
      <button
        type="button"
        className="underline disabled:no-underline"
        disabled={resent}
        onClick={() => void api.resendVerification(email).then(() => setResent(true))}
      >
        {resent ? t("auth.sentAgain") : t("auth.sendAgain")}
      </button>
    </div>
  );
}

/** A text field with a label that is always visible (not a placeholder), plus optional helper copy. */
function LabeledInput({
  label,
  hint,
  type = "text",
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  hint?: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange(value: string): void;
  autoComplete?: string;
}) {
  useT();
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800 dark:text-slate-100">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={`input${isPassword ? " pr-16" : ""}`}
          type={isPassword && shown ? "text" : type}
          value={value}
          autoComplete={autoComplete}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {isPassword && (
          <button
            type="button"
            className="absolute inset-y-0 right-0 min-w-[44px] px-3 text-sm text-felt-700 underline dark:text-felt-300"
            aria-pressed={shown}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? t("auth.hide") : t("auth.show")}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-slate-600 dark:text-slate-300">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A small keyboard drawing for the landing card; decorative. */
function KeysIllustration() {
  const whites = Array.from({ length: 8 }, (_, i) => i);
  const blacks = [0, 1, 3, 4, 5];
  return (
    <svg viewBox="0 0 160 56" className="h-16 w-full" role="presentation" aria-hidden="true">
      {whites.map((i) => (
        <rect key={i} x={i * 20 + 0.5} y={0.5} width={19} height={55} rx={3} className="fill-white stroke-slate-300 dark:fill-slate-100 dark:stroke-slate-500" />
      ))}
      <rect x={60.5} y={0.5} width={19} height={55} rx={3} className="fill-felt-400/60 stroke-felt-500" />
      {blacks.map((i) => (
        <rect key={i} x={i * 20 + 14} y={0.5} width={12} height={34} rx={2} className="fill-slate-800 dark:fill-slate-900" />
      ))}
    </svg>
  );
}

export function RegistrationForm({
  onRegistered,
  onGoogleSignedIn,
  submitLabel,
}: {
  onRegistered(): void;
  /** Offer Google sign-in too; called with whether a new account was created. */
  onGoogleSignedIn?(created: boolean): void;
  submitLabel?: string;
}) {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if ((await register(email, password, name)) === "verify") {
        setVerifyEmail(email);
        return;
      }
      onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.registrationFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (verifyEmail) return <CheckYourEmail email={verifyEmail} />;

  return (
    <div className="space-y-3">
      <LabeledInput
        label={t("auth.name")}
        hint={t("auth.nameHint")}
        value={name}
        onChange={setName}
        autoComplete="name"
      />
      <LabeledInput
        label={t("common.email")}
        type="email"
        hint={t("auth.emailHint")}
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
      <LabeledInput
        label={t("common.password")}
        type="password"
        hint={t("auth.passwordHint")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
      />
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <button className="primary-button w-full" disabled={busy} onClick={() => void submit()}>
        {busy ? t("auth.creating") : (submitLabel ?? t("auth.createAccount"))}
      </button>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {tRich("auth.agree", {
          terms: (c) => (
            <Link to="/terms" className="underline">
              {c}
            </Link>
          ),
          privacy: (c) => (
            <Link to="/privacy" className="underline">
              {c}
            </Link>
          ),
        })}
      </p>
      {onGoogleSignedIn && <GoogleOption onSignedIn={onGoogleSignedIn} />}
    </div>
  );
}

export default function AuthPage({ onEntered }: { onEntered(kind: EntryKind): void }) {
  useT();
  const { login } = useAuth();
  // The shared demo account is for the private build only; unknown config counts as "not public yet".
  const serverConfig = useServerConfig();
  const demoAvailable = serverConfig !== null && !serverConfig.publicCatalogue;
  const [mode, setMode] = useState<"landing" | "login" | "register">("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);

  const logIn = async (demo = false) => {
    setError(null);
    setUnverified(false);
    try {
      await login(demo ? "demo@keyboardsensei.local" : email, demo ? "demo-password" : password);
      onEntered(demo ? "demo" : "login");
    } catch (e) {
      if (e instanceof api.ApiError && e.code === "email_not_verified") {
        setUnverified(true);
        return;
      }
      setError(e instanceof Error ? e.message : t("auth.loginFailed"));
    }
  };
  const googleSignedIn = (created: boolean) => onEntered(created ? "signup" : "login");

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <section className="card relative w-full overflow-hidden p-6 shadow-sm">
        <div className="felt-strip absolute inset-x-0 top-0" />
        <div className="space-y-5">
          <div>
            <h1>
              <Wordmark size="lg" />
            </h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Formerly Midivory
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t("auth.tagline")}
            </p>
          </div>
          {mode === "landing" && <KeysIllustration />}

          {mode === "landing" && (
            <div className="space-y-3">
              <button className="primary-button w-full" onClick={() => setMode("register")}>
                {t("auth.createFree")}
              </button>
              {demoAvailable && (
                <button className="secondary-button w-full" onClick={() => void logIn(true)}>
                  {t("auth.tryDemo")}
                </button>
              )}
              <button
                className="w-full text-sm text-felt-700 underline dark:text-felt-300"
                onClick={() => setMode("login")}
              >
                {t("auth.haveAccount")}
              </button>
            </div>
          )}

          {mode === "login" && (
            <div className="space-y-3">
              <LabeledInput label={t("common.email")} type="email" value={email} onChange={setEmail} autoComplete="email" />
              <LabeledInput
                label={t("common.password")}
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
              {error && (
                <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                  {error}
                </p>
              )}
              {unverified && <CheckYourEmail email={email} />}
              <button className="primary-button w-full" onClick={() => void logIn()}>
                {t("auth.logIn")}
              </button>
              <Link
                to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                className="block text-center text-sm text-felt-700 underline dark:text-felt-300"
              >
                {t("auth.forgot")}
              </Link>
              <GoogleOption onSignedIn={googleSignedIn} />
              <button className="w-full text-sm underline" onClick={() => setMode("landing")}>
                {t("common.back")}
              </button>
            </div>
          )}

          {mode === "register" && (
            <div className="space-y-3">
              <RegistrationForm onRegistered={() => onEntered("signup")} onGoogleSignedIn={googleSignedIn} />
              <button
                className="w-full text-sm text-felt-700 underline dark:text-felt-300"
                onClick={() => setMode("login")}
              >
                {t("auth.haveAccount")}
              </button>
            </div>
          )}
          <LegalLinks className="pt-1" />
        </div>
      </section>
    </main>
  );
}

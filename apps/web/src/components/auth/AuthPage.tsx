import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import * as api from "../../services/api";
import { LegalLinks } from "../legal/PublicPageLayout";
import GoogleSignInButton, { googleSignInEnabled } from "./GoogleSignInButton";

type EntryKind = "demo" | "signup" | "login";

/** "or" rule plus the Google button; nothing at all until Google sign-in is configured. */
function GoogleOption({ onSignedIn }: { onSignedIn(created: boolean): void }) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (!googleSignInEnabled) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <GoogleSignInButton
        onCredential={(credential) => {
          setError(null);
          loginWithGoogle(credential)
            .then(onSignedIn)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : "Google sign-in failed"));
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
  const [resent, setResent] = useState(false);
  return (
    <div role="status" className="space-y-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
      <p>
        We've sent a confirmation link to <strong>{email}</strong>. Open it to finish setting up your account.
      </p>
      <button
        type="button"
        className="underline disabled:no-underline"
        disabled={resent}
        onClick={() => void api.resendVerification(email).then(() => setResent(true))}
      >
        {resent ? "Sent again" : "Send the link again"}
      </button>
    </div>
  );
}

export function RegistrationForm({
  onRegistered,
  onGoogleSignedIn,
  submitLabel = "Create account",
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
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  if (verifyEmail) return <CheckYourEmail email={verifyEmail} />;

  return (
    <div className="space-y-3">
      <input
        aria-label="Display name"
        className="input"
        placeholder="Display name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        aria-label="Email"
        className="input"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <p className="text-xs text-slate-600 dark:text-slate-300">
        Use an email address you can receive mail at: it's how you reset a forgotten password.
      </p>
      <input
        aria-label="Password"
        className="input"
        type="password"
        placeholder="Password (8+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <button className="primary-button w-full" disabled={busy} onClick={() => void submit()}>
        {busy ? "Creating account…" : submitLabel}
      </button>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        By creating an account you agree to the{" "}
        <Link to="/terms" className="underline">
          terms
        </Link>{" "}
        and the{" "}
        <Link to="/privacy" className="underline">
          privacy policy
        </Link>
        .
      </p>
      {onGoogleSignedIn && <GoogleOption onSignedIn={onGoogleSignedIn} />}
    </div>
  );
}

export default function AuthPage({ onEntered }: { onEntered(kind: EntryKind): void }) {
  const { login } = useAuth();
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
      setError(e instanceof Error ? e.message : "Login failed");
    }
  };
  const googleSignedIn = (created: boolean) => onEntered(created ? "signup" : "login");

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <section className="card relative w-full overflow-hidden p-6 shadow-sm">
        <div className="felt-strip absolute inset-x-0 top-0" />
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Keyboard <span className="text-felt-600 dark:text-felt-400">Sensei</span>
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Build classical piano technique through a growing library of focused lessons.
            </p>
          </div>

          {mode === "landing" && (
            <div className="space-y-3">
              <button className="primary-button w-full" onClick={() => void logIn(true)}>
                Start Demo
              </button>
              <button className="secondary-button w-full" onClick={() => setMode("register")}>
                Sign Up
              </button>
              <button
                className="w-full text-sm text-felt-700 underline dark:text-felt-300"
                onClick={() => setMode("login")}
              >
                Already have an account? Log in
              </button>
            </div>
          )}

          {mode === "login" && (
            <div className="space-y-3">
              <input
                aria-label="Email"
                className="input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                aria-label="Password"
                className="input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                  {error}
                </p>
              )}
              {unverified && <CheckYourEmail email={email} />}
              <button className="primary-button w-full" onClick={() => void logIn()}>
                Log in
              </button>
              <Link
                to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                className="block text-center text-sm text-felt-700 underline dark:text-felt-300"
              >
                Forgot password?
              </Link>
              <GoogleOption onSignedIn={googleSignedIn} />
              <button className="w-full text-sm underline" onClick={() => setMode("landing")}>
                Back
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
                Already have an account? Log in
              </button>
            </div>
          )}
          <LegalLinks className="pt-1" />
        </div>
      </section>
    </main>
  );
}

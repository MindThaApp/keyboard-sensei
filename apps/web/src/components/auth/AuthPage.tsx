import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

type EntryKind = "demo" | "signup" | "login";

function OAuthStubs() {
  return (
    <div className="space-y-2" title="Coming soon">
      <button type="button" disabled className="secondary-button w-full cursor-not-allowed opacity-55">
        Continue with Google · Coming soon
      </button>
      <button type="button" disabled className="secondary-button w-full cursor-not-allowed opacity-55">
        Continue with Apple · Coming soon
      </button>
    </div>
  );
}

export function RegistrationForm({
  onRegistered,
  submitLabel = "Create account",
}: {
  onRegistered(): void;
  submitLabel?: string;
}) {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await register(email, password, name);
      onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

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
        Use an email address rather than a bare username so account recovery can be supported later.
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
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <OAuthStubs />
    </div>
  );
}

export default function AuthPage({ onEntered }: { onEntered(kind: EntryKind): void }) {
  const { login } = useAuth();
  const [mode, setMode] = useState<"landing" | "login" | "register">("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const logIn = async (demo = false) => {
    setError(null);
    try {
      await login(demo ? "demo@keyboardsensei.local" : email, demo ? "demo-password" : password);
      onEntered(demo ? "demo" : "login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    }
  };

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
              <button className="primary-button w-full" onClick={() => void logIn()}>
                Log in
              </button>
              <button className="w-full text-sm underline" onClick={() => setMode("landing")}>
                Back
              </button>
            </div>
          )}

          {mode === "register" && (
            <div className="space-y-3">
              <RegistrationForm onRegistered={() => onEntered("signup")} />
              <button
                className="w-full text-sm text-felt-700 underline dark:text-felt-300"
                onClick={() => setMode("login")}
              >
                Already have an account? Log in
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

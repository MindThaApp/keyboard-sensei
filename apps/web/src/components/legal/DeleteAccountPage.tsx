import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import * as api from "../../services/api";
import PublicPageLayout, { CONTACT_EMAIL, Prose } from "./PublicPageLayout";

/** What deletion removes; shared with the in-app confirmation so the two never disagree. */
export const DELETED_DATA = [
  "your account: email, display name, password and Google link",
  "lesson progress, exercise and quiz attempts, and play-along runs",
  "experience points, achievements, streaks and practice minutes",
  "songs you uploaded, recordings you saved, archive imports and instruments, including the files",
  "feedback you sent, including any screenshots",
];

/**
 * The public "how to delete your account" page Google Play links to. Works signed out:
 * email + password is enough. Signed in, it also points at Settings.
 */
export default function DeleteAccountPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccountWithPassword(email, password);
      setDone(true);
      setPassword("");
      // Deleting the account you're signed in to ends the session too.
      if (auth.user && auth.user.email.toLowerCase() === email.trim().toLowerCase()) auth.logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicPageLayout title="Delete your account">
      <Prose>
        <p>
          You can delete your OctaviApp account and all of its data at any time. Deletion is immediate and can't be
          undone. It removes:
        </p>
        <ul>
          {DELETED_DATA.map((item) => (
            <li key={item}>{item[0]!.toUpperCase() + item.slice(1)}.</li>
          ))}
        </ul>
        <p>
          Backups made before the deletion are kept for up to 14 days and then deleted. See the{" "}
          <Link to="/privacy">privacy policy</Link> for details.
        </p>

        <h2>Two ways to do it</h2>
        <ul>
          <li>
            <strong>In the app:</strong> Settings → Account → Delete account.
            {auth.authenticated && (
              <>
                {" "}
                <Link to="/settings">Open Settings</Link>
              </>
            )}
          </li>
          <li>
            <strong>Here, without signing in:</strong> enter your email and password below.
          </li>
        </ul>
        <p>
          If you only ever signed in with Google, either delete from Settings in the app (you'll confirm with Google), or
          use <Link to="/forgot-password">Forgot password</Link> to set a password first. If you can't do either, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20account`}>{CONTACT_EMAIL}</a> from the address on the
          account and we'll delete it for you.
        </p>
      </Prose>

      <section className="card mt-8 p-5" aria-labelledby="delete-form-heading">
        <h2 id="delete-form-heading" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          Delete my account
        </h2>
        {done ? (
          <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
            Your account and its data have been deleted.
          </p>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
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
            <input
              aria-label="Password"
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I understand this permanently deletes my account and everything in it.
            </label>
            {error && (
              <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !confirmed || !email || !password}
              className="rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete my account"}
            </button>
          </form>
        )}
      </section>
    </PublicPageLayout>
  );
}

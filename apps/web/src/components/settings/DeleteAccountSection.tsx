import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import * as api from "../../services/api";
import GoogleSignInButton, { googleSignInEnabled } from "../auth/GoogleSignInButton";
import { DELETED_DATA } from "../legal/DeleteAccountPage";
import { LegalLinks } from "../legal/PublicPageLayout";

/** Settings → Account: the policies, and permanent deletion confirmed with the password (or Google). */
export default function DeleteAccountSection() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (confirm: { password: string } | { google_credential: string }) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteMyAccount(confirm);
      // The account is gone; signing out returns to the start screen.
      logout();
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the account");
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4 p-5" aria-labelledby="privacy-account-heading">
      <div>
        <h2 id="privacy-account-heading" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          Privacy and your data
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">How we handle your data, the terms you agreed to, and the licences of what the app uses.</p>
      </div>
      <LegalLinks align="start" className="text-sm" />

      <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
        {!open ? (
          <button type="button" className="text-sm font-medium text-rose-700 underline dark:text-rose-400" onClick={() => setOpen(true)}>
            Delete account
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/30">
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">Delete your account permanently?</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">This can't be undone. It removes:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
              {DELETED_DATA.map((item) => (
                <li key={item}>{item[0]!.toUpperCase() + item.slice(1)}</li>
              ))}
            </ul>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void remove({ password });
              }}
            >
              <label htmlFor="delete-password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Enter your password to confirm
              </label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy || !password}
                  className="rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Delete my account"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setOpen(false);
                    setPassword("");
                    setError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
            {googleSignInEnabled && user?.google_linked && (
              <div className="space-y-2 border-t border-rose-200 pt-3 dark:border-rose-900">
                <p className="text-sm text-slate-700 dark:text-slate-300">Signed up with Google? Confirm with Google instead:</p>
                <GoogleSignInButton text="continue_with" onCredential={(credential) => void remove({ google_credential: credential })} />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                {error}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Forgotten your password? <Link to="/forgot-password" className="underline">Reset it</Link> first.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

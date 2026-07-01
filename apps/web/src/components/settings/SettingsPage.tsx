import { useEffect, useState } from "react";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useAuth } from "../../contexts/AuthContext";
import { useMidiContext } from "../midi/MidiContext";
import MidiStatusBar from "../midi/MidiStatusBar";
import VirtualPiano from "../piano/VirtualPiano";
import * as api from "../../services/api";

function AccountSection() {
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setDisplayName(user.display_name);
  }, [user]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameError(null);
    setNameStatus(null);
    try {
      const updated = await api.updateProfile(displayName);
      setUser(updated);
      setNameStatus("Saved.");
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Could not save display name.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordStatus(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordStatus("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <section className="space-y-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Account</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
      </div>

      <form onSubmit={(e) => void handleSaveName(e)} className="space-y-2">
        <label htmlFor="display-name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={savingName || !displayName.trim()}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Save
          </button>
        </div>
        {nameStatus && <p className="text-sm text-emerald-700 dark:text-emerald-400">{nameStatus}</p>}
        {nameError && <p className="text-sm text-rose-700 dark:text-rose-400">{nameError}</p>}
      </form>

      <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Change password</p>
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          type="password"
          placeholder="New password (8+ characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={savingPassword || !currentPassword || newPassword.length < 8}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
        >
          Update password
        </button>
        {passwordStatus && <p className="text-sm text-emerald-700 dark:text-emerald-400">{passwordStatus}</p>}
        {passwordError && <p className="text-sm text-rose-700 dark:text-rose-400">{passwordError}</p>}
      </form>
    </section>
  );
}

function MidiSection() {
  const { subscribe } = useMidiContext();
  const [lastNote, setLastNote] = useState<string | null>(null);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "noteon") setLastNote(midiNoteToName(event.note));
    });
  }, [subscribe]);

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">MIDI device</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Connect a real MIDI keyboard, or test with the on-screen piano below — both work the same
          way in every lesson.
        </p>
      </div>
      <MidiStatusBar />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Last note played: <span className="font-medium text-slate-900 dark:text-slate-100">{lastNote ?? "—"}</span>
      </p>
      <VirtualPiano />
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
      <AccountSection />
      <MidiSection />
    </div>
  );
}

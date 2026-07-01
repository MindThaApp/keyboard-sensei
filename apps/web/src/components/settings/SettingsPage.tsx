import { useEffect, useRef, useState } from "react";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useAuth } from "../../contexts/AuthContext";
import { useMidiContext } from "../midi/MidiContext";
import MidiStatusBar from "../midi/MidiStatusBar";
import VirtualPiano from "../piano/VirtualPiano";
import { NARRATION_VOICES } from "../../data/narrationVoices";
import * as api from "../../services/api";

/** A theory-card in lesson 1 — used as the fixed sample text for "test my selected voice." */
const TEST_NARRATION_LESSON_ID = "lesson-01";
const TEST_NARRATION_SECTION_INDEX = 0;

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

function UsageBar({ usage }: { usage: api.TtsUsage }) {
  const percent = Math.min(100, Math.round((usage.charactersUsed / usage.limit) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          {usage.charactersUsed.toLocaleString()} / {usage.limit.toLocaleString()} characters used this month
        </span>
        <span>{usage.period}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full ${usage.disabled ? "bg-rose-500" : "bg-sky-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {usage.disabled && (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          Free narration allowance used up for this month. Read-aloud is disabled until it resets, or a paid
          ElevenLabs plan is added.
        </p>
      )}
    </div>
  );
}

function NarrationSection() {
  const { user, setUser } = useAuth();
  const [usage, setUsage] = useState<api.TtsUsage | null>(null);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [testLoading, setTestLoading] = useState(false);
  const [testPlaying, setTestPlaying] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void api.getTtsUsage().then(setUsage).catch(() => undefined);
  }, []);

  async function selectVoice(voiceId: string) {
    setSavingVoiceId(voiceId);
    setVoiceError(null);
    try {
      const updated = await api.updateNarrationVoice(voiceId);
      setUser(updated);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Could not save voice preference.");
    } finally {
      setSavingVoiceId(null);
    }
  }

  function playPreview(voiceId: string, previewUrl: string) {
    previewAudioRef.current?.pause();
    if (playingPreviewId === voiceId) {
      setPlayingPreviewId(null);
      return;
    }
    const el = new Audio(previewUrl);
    el.onended = () => setPlayingPreviewId(null);
    previewAudioRef.current = el;
    void el.play();
    setPlayingPreviewId(voiceId);
  }

  async function handleTestNarration() {
    if (!user?.narration_voice_id) return;
    if (testAudioRef.current) {
      if (testPlaying) {
        testAudioRef.current.pause();
        setTestPlaying(false);
      } else {
        void testAudioRef.current.play();
        setTestPlaying(true);
      }
      return;
    }
    setTestLoading(true);
    setTestError(null);
    try {
      const response = await api.narrateSection(TEST_NARRATION_LESSON_ID, TEST_NARRATION_SECTION_INDEX, user.narration_voice_id);
      const el = new Audio(api.ttsAudioUrl(response.audioUrl));
      el.onended = () => setTestPlaying(false);
      testAudioRef.current = el;
      await el.play();
      setTestPlaying(true);
      setUsage(response.usage);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Could not generate narration.");
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Narration voice</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pick a voice to have lesson text read aloud. Previews are free; actually narrating lesson content
          uses a shared monthly allowance across everyone using the app.
        </p>
      </div>

      {usage && <UsageBar usage={usage} />}

      <div className="grid gap-2 sm:grid-cols-2">
        {NARRATION_VOICES.map((voice) => {
          const isSelected = user?.narration_voice_id === voice.id;
          return (
            <div
              key={voice.id}
              className={`flex items-center justify-between gap-2 rounded-md border p-3 ${
                isSelected
                  ? "border-sky-500 bg-sky-50 dark:border-sky-500 dark:bg-sky-950"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{voice.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{voice.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => playPreview(voice.id, voice.previewUrl)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:text-slate-200"
                >
                  {playingPreviewId === voice.id ? "⏸" : "▶"} Sample
                </button>
                <button
                  type="button"
                  onClick={() => void selectVoice(voice.id)}
                  disabled={savingVoiceId === voice.id || isSelected}
                  className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                    isSelected
                      ? "bg-sky-600 text-white"
                      : "bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
                  }`}
                >
                  {isSelected ? "Selected" : "Select"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {voiceError && <p className="text-sm text-rose-700 dark:text-rose-400">{voiceError}</p>}

      {user?.narration_voice_id && (
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
          <button
            type="button"
            onClick={() => void handleTestNarration()}
            disabled={testLoading || usage?.disabled}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            {testLoading ? "Generating…" : testPlaying ? "⏸ Pause test narration" : "🔊 Test my selected voice on a real lesson"}
          </button>
          {testError && <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">{testError}</p>}
        </div>
      )}
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
      <NarrationSection />
      <MidiSection />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme, type AccentTheme, type Theme } from "../../contexts/ThemeContext";
import { useMidiContext } from "../midi/MidiContext";
import MidiStatusBar from "../midi/MidiStatusBar";
import VirtualPiano from "../piano/VirtualPiano";
import InstrumentSection from "./InstrumentSection";
import SongLibrarySection from "./SongLibrarySection";
import { NARRATION_VOICES } from "../../data/narrationVoices";
import * as api from "../../services/api";
import {
  KEYBOARD_SIZE_OPTIONS,
  autoRangePreference,
  explicitRangePreference,
  type KeyboardSize,
} from "../../utils/keyboardRange";
import { loadHighlightEnabled, saveHighlightEnabled } from "../../utils/notationHighlight";

/** A theory-card in lesson 1 — used as the fixed sample text for "test my selected voice." */
const TEST_NARRATION_LESSON_ID = "lesson-01";
const TEST_NARRATION_SECTION_INDEX = 0;

const ACCENT_OPTIONS: { id: AccentTheme; label: string; swatch: string }[] = [
  { id: "felt", label: "Felt Crimson", swatch: "#b4323e" },
  { id: "ocean", label: "Ocean", swatch: "#0284c7" },
  { id: "forest", label: "Forest", swatch: "#16a34a" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
];

const MODE_OPTIONS: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "midnight", label: "Midnight" },
];

function AppearanceSection() {
  const { theme, setTheme, accentTheme, setAccentTheme } = useTheme();

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Mode</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Colour mode">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={theme === option.id}
              onClick={() => setTheme(option.id)}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                theme === option.id
                  ? "border-felt-500 bg-felt-50 text-felt-700 ring-1 ring-felt-500/40 dark:bg-felt-900/30 dark:text-felt-300"
                  : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Colours</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose an app accent. Light, dark, and midnight modes stay separate.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ACCENT_OPTIONS.map((option) => {
          const selected = accentTheme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setAccentTheme(option.id)}
              className={`flex items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                selected
                  ? "border-felt-500 bg-felt-50 ring-1 ring-felt-500/40 dark:bg-felt-900/30"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-500"
              }`}
              aria-pressed={selected}
            >
              <span className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: option.swatch }} />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

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
    <section className="card space-y-6 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Account</h2>
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
            className="input flex-1"
          />
          <button type="submit" disabled={savingName || !displayName.trim()} className="primary-button">
            Save
          </button>
        </div>
        {nameStatus && <p className="text-sm text-emerald-700 dark:text-emerald-400">{nameStatus}</p>}
        {nameError && (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
            {nameError}
          </p>
        )}
      </form>

      <form
        onSubmit={(e) => void handleChangePassword(e)}
        className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700"
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Change password</p>
        <input
          aria-label="Current password"
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="input"
        />
        <input
          aria-label="New password"
          type="password"
          placeholder="New password (8+ characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="input"
        />
        <button
          type="submit"
          disabled={savingPassword || !currentPassword || newPassword.length < 8}
          className="primary-button"
        >
          Update password
        </button>
        {passwordStatus && <p className="text-sm text-emerald-700 dark:text-emerald-400">{passwordStatus}</p>}
        {passwordError && (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
            {passwordError}
          </p>
        )}
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
          className={`h-full rounded-full ${usage.disabled ? "bg-rose-500" : "bg-felt-500"}`}
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
      const response = await api.narrateSection(
        TEST_NARRATION_LESSON_ID,
        TEST_NARRATION_SECTION_INDEX,
        user.narration_voice_id,
      );
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
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Narration voice</h2>
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
                  ? "border-felt-400 bg-felt-50 ring-1 ring-felt-400/50 dark:border-felt-600 dark:bg-felt-900/30 dark:ring-felt-600/50"
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
                  className="secondary-button px-2 py-1 text-xs"
                >
                  {playingPreviewId === voice.id ? "⏸" : "▶"} Sample
                </button>
                <button
                  type="button"
                  onClick={() => void selectVoice(voice.id)}
                  disabled={savingVoiceId === voice.id || isSelected}
                  className={
                    isSelected
                      ? "rounded-md bg-felt-600 px-2 py-1 text-xs font-medium text-white"
                      : "primary-button px-2 py-1 text-xs"
                  }
                >
                  {isSelected ? "Selected" : "Select"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {voiceError && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          {voiceError}
        </p>
      )}

      {user?.narration_voice_id && (
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
          <button
            type="button"
            onClick={() => void handleTestNarration()}
            disabled={testLoading || usage?.disabled}
            className="primary-button"
          >
            {testLoading ? "Generating…" : testPlaying ? "⏸ Pause test narration" : "🔊 Test my selected voice on a real lesson"}
          </button>
          {testError && (
            <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
              {testError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function MidiSection() {
  const {
    devices,
    deviceRange,
    deviceRangePreference,
    setDeviceRangePreference,
    currentDeviceKey,
    startCalibration,
    subscribe,
    sustainPedalDown,
  } = useMidiContext();
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(loadHighlightEnabled);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "noteon") setLastNote(midiNoteToName(event.note));
    });
  }, [subscribe]);

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">MIDI device</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Connect a real MIDI keyboard, or test with the on-screen piano below — both work the same
          way in every lesson.
        </p>
      </div>
      <MidiStatusBar />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Last note played: <span className="font-medium text-slate-900 dark:text-slate-100">{lastNote ?? "—"}</span>
      </p>
      <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            My MIDI keyboard
            <select
              value={deviceRangePreference.mode === "explicit" ? String(deviceRangePreference.keys) : "auto"}
              onChange={(e) => {
                if (e.target.value === "auto") setDeviceRangePreference(autoRangePreference(deviceRange));
                else setDeviceRangePreference(explicitRangePreference(Number(e.target.value) as KeyboardSize));
              }}
              className="input mt-1"
            >
              <option value="auto">Learn from what I play</option>
              {KEYBOARD_SIZE_OPTIONS.map((option) => (
                <option key={option.keys} value={option.keys}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={startCalibration}
            disabled={!devices[0]}
            className="secondary-button"
          >
            Recalibrate
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {devices[0]?.name
            ? `${devices[0].name}: ${midiNoteToName(deviceRange.lowestNote)}-${midiNoteToName(deviceRange.highestNote)} (${deviceRangePreference.mode}; ${currentDeviceKey ?? "unknown device key"})`
            : "Connect a MIDI keyboard to save this preference for that device."}
        </p>
        {sustainPedalDown && <p className="text-xs font-medium text-felt-700 dark:text-felt-300">Sustain pedal down</p>}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={highlightEnabled}
          onChange={(e) => {
            setHighlightEnabled(e.target.checked);
            saveHighlightEnabled(e.target.checked);
          }}
        />
        Highlight notes as I play them
      </label>
      <VirtualPiano />
    </section>
  );
}

type SettingsTab = "account" | "appearance" | "instruments" | "midi" | "narration" | "library";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "instruments", label: "Instruments" },
  { id: "midi", label: "MIDI" },
  { id: "narration", label: "Narration" },
  { id: "library", label: "Library" },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "account" || value === "appearance" || value === "instruments" || value === "midi" || value === "narration" || value === "library";
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const activeTab = isSettingsTab(params.get("tab")) ? params.get("tab") : "account";

  function selectTab(tab: SettingsTab) {
    setParams(tab === "account" ? {} : { tab });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
            className={`rounded-t-md px-3 py-2 text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "account" && <AccountSection />}
      {activeTab === "appearance" && <AppearanceSection />}
      {activeTab === "instruments" && <InstrumentSection />}
      {activeTab === "midi" && <MidiSection />}
      {activeTab === "narration" && <NarrationSection />}
      {activeTab === "library" && <SongLibrarySection />}
    </div>
  );
}

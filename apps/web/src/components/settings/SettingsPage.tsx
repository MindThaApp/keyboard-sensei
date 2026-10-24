import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useAuth } from "../../contexts/AuthContext";
import { useExperience } from "../../contexts/ExperienceContext";
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
import AudioLatencySection from "./AudioLatencySection";
import DailyGoalSection from "./DailyGoalSection";
import CrashReportingSection from "./CrashReportingSection";
import DeleteAccountSection from "./DeleteAccountSection";
import AppearanceSection from "./AppearanceSection";
import { SettingsRow } from "./SettingsRow";
import { Advanced, Button, ListGroup, ListRow, SegmentedControl, Toggle } from "../ui";

/** A theory-card in lesson 1 — used as the fixed sample text for "test my selected voice." */
const TEST_NARRATION_LESSON_ID = "lesson-01";
const TEST_NARRATION_SECTION_INDEX = 0;

function GeneralSection() {
  const { experience, setExperience } = useExperience();
  return (
    <div className="space-y-6">
      <ListGroup
        header="Experience"
        footer="Simple keeps each screen to the essentials. Advanced shows every control. Nothing is removed, only tucked away."
        aria-label="Experience"
      >
        <SettingsRow title="Interface">
          <SegmentedControl
            aria-label="Simple or Advanced"
            options={[
              { value: "simple", label: "Simple" },
              { value: "advanced", label: "Advanced" },
            ]}
            value={experience}
            onChange={setExperience}
          />
        </SettingsRow>
      </ListGroup>
      <DailyGoalSection />
      <CrashReportingSection />
    </div>
  );
}

/** Simple mode tucks a section away; this row says so and offers the way back. */
function MoreOptionsRow({ what }: { what: string }) {
  const { setExperience } = useExperience();
  return (
    <ListGroup aria-label="More options">
      <ListRow title="More options" subtitle={`${what} is part of the Advanced interface.`} onClick={() => setExperience("advanced")} accessory="chevron" />
    </ListGroup>
  );
}

function AccountSection() {
  const { user, setUser, acceptSession } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [signingOutAll, setSigningOutAll] = useState(false);
  const [signOutStatus, setSignOutStatus] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

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

  // Voids every session, then the response hands this device a fresh token.
  async function handleSignOutAll() {
    setSigningOutAll(true);
    setSignOutError(null);
    setSignOutStatus(null);
    try {
      const body = await api.signOutAll();
      acceptSession({ accessToken: body.accessToken, user: body.user });
      setSignOutStatus("Signed out everywhere else. You stay signed in on this device.");
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : "Could not sign out other devices.");
    } finally {
      setSigningOutAll(false);
    }
  }

  return (
    <div className="space-y-6">
      <ListGroup header="Account" footer={user?.email} aria-label="Display name">
        <li className="ks-row">
          <form onSubmit={(e) => void handleSaveName(e)} className="settings-row">
            <label htmlFor="display-name" className="settings-row__title">
              Display name
            </label>
            <div className="settings-row__body">
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="settings-field"
                style={{ flex: "1 1 12rem", width: "auto" }}
              />
              <Button type="submit" variant="filled" disabled={savingName || !displayName.trim()}>
                Save
              </Button>
            </div>
            {nameStatus && <p className="settings-status m-0">{nameStatus}</p>}
            {nameError && (
              <p role="alert" className="settings-error m-0">
                {nameError}
              </p>
            )}
          </form>
        </li>
      </ListGroup>

      <ListGroup header="Change password" aria-label="Change password">
        <li className="ks-row">
          <form onSubmit={(e) => void handleChangePassword(e)} className="settings-row">
            <input
              aria-label="Current password"
              type="password"
              placeholder="Current password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="settings-field"
            />
            <input
              aria-label="New password"
              type="password"
              placeholder="New password (8+ characters)"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="settings-field"
            />
            <div className="settings-row__body">
              <Button type="submit" variant="filled" disabled={savingPassword || !currentPassword || newPassword.length < 8}>
                Update password
              </Button>
            </div>
            {passwordStatus && <p className="settings-status m-0">{passwordStatus}</p>}
            {passwordError && (
              <p role="alert" className="settings-error m-0">
                {passwordError}
              </p>
            )}
          </form>
        </li>
      </ListGroup>

      <ListGroup
        header="Sessions"
        footer="Ends your sign-in on every phone, tablet and browser. This device stays signed in."
        aria-label="Sessions"
      >
        <SettingsRow>
          <div>
            <Button variant="gray" loading={signingOutAll} onClick={() => void handleSignOutAll()}>
              Sign out of all devices
            </Button>
          </div>
          <p aria-live="polite" className="m-0">
            {signOutStatus && <span className="settings-status">{signOutStatus}</span>}
            {signOutError && (
              <span role="alert" className="settings-error">
                {signOutError}
              </span>
            )}
          </p>
        </SettingsRow>
      </ListGroup>

      <DeleteAccountSection />
    </div>
  );
}

function NarrationSection() {
  const { user, setUser } = useAuth();
  // The monthly allowance is shared across all users, so it is not shown; we only
  // learn from it whether narrating is currently possible.
  const [narrationPaused, setNarrationPaused] = useState(false);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [testLoading, setTestLoading] = useState(false);
  const [testPlaying, setTestPlaying] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void api
      .getTtsUsage()
      .then((usage) => setNarrationPaused(usage.disabled))
      .catch(() => undefined);
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
      setNarrationPaused(response.usage.disabled);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Could not generate narration.");
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <ListGroup
        header="Narration voice"
        footer={
          narrationPaused
            ? "Read-aloud is paused for now. Voice samples still work."
            : "Pick a voice to have lesson text read aloud."
        }
        aria-label="Narration voice"
      >
        {NARRATION_VOICES.map((voice) => {
          const isSelected = user?.narration_voice_id === voice.id;
          return (
            <ListRow
              key={voice.id}
              title={voice.name}
              subtitle={voice.description}
              accessory={
                <>
                  <Button size="sm" onClick={() => playPreview(voice.id, voice.previewUrl)}>
                    {playingPreviewId === voice.id ? "Pause" : "Sample"}
                  </Button>
                  <Button
                    size="sm"
                    variant={isSelected ? "tinted" : "filled"}
                    onClick={() => void selectVoice(voice.id)}
                    disabled={savingVoiceId === voice.id || isSelected}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </Button>
                </>
              }
            />
          );
        })}
      </ListGroup>
      {voiceError && (
        <p role="alert" className="settings-error">
          {voiceError}
        </p>
      )}

      {user?.narration_voice_id && (
        <ListGroup aria-label="Test narration">
          <SettingsRow>
            <div>
              <Button variant="gray" onClick={() => void handleTestNarration()} disabled={testLoading || narrationPaused}>
                {testLoading ? "Generating…" : testPlaying ? "Pause test narration" : "Test my voice on a real lesson"}
              </Button>
            </div>
            {testError && (
              <p role="alert" className="settings-error m-0">
                {testError}
              </p>
            )}
          </SettingsRow>
        </ListGroup>
      )}
    </div>
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
    <div className="space-y-6">
      <ListGroup
        header="Keyboard connection"
        footer="Connect a real keyboard, or test with the on-screen piano below. Both work the same way in every lesson."
        aria-label="Keyboard connection"
      >
        <SettingsRow value={<>Last note: {lastNote ?? "none yet"}</>}>
          <MidiStatusBar />
        </SettingsRow>
      </ListGroup>

      <ListGroup
        header="My keyboard"
        footer={
          devices[0]?.name
            ? `${devices[0].name}: ${midiNoteToName(deviceRange.lowestNote)}-${midiNoteToName(deviceRange.highestNote)} (${deviceRangePreference.mode}; ${currentDeviceKey ?? "unknown device key"})${sustainPedalDown ? ". Sustain pedal down." : ""}`
            : "Connect a keyboard to save this preference for that device."
        }
        aria-label="My keyboard"
      >
        <SettingsRow title="Keyboard size">
          <select
            aria-label="My keyboard"
            value={deviceRangePreference.mode === "explicit" ? String(deviceRangePreference.keys) : "auto"}
            onChange={(e) => {
              if (e.target.value === "auto") setDeviceRangePreference(autoRangePreference(deviceRange));
              else setDeviceRangePreference(explicitRangePreference(Number(e.target.value) as KeyboardSize));
            }}
            className="settings-field"
          >
            <option value="auto">Learn from what I play</option>
            {KEYBOARD_SIZE_OPTIONS.map((option) => (
              <option key={option.keys} value={option.keys}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingsRow>
        <ListRow title="Recalibrate" subtitle="Press your lowest and highest keys" onClick={startCalibration} disabled={!devices[0]} accessory="chevron" />
        <SettingsRow>
          <Toggle
            label="Highlight notes as I play them"
            checked={highlightEnabled}
            onChange={(checked) => {
              setHighlightEnabled(checked);
              saveHighlightEnabled(checked);
            }}
          />
        </SettingsRow>
      </ListGroup>

      <VirtualPiano />
    </div>
  );
}

type SettingsTab = "general" | "account" | "appearance" | "instruments" | "midi" | "narration" | "library";

const SETTINGS_TABS: { value: SettingsTab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "appearance", label: "Appearance" },
  { value: "account", label: "Account" },
  { value: "instruments", label: "Instruments" },
  { value: "midi", label: "Keyboard" },
  { value: "narration", label: "Narration" },
  { value: "library", label: "Library" },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.value === value);
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const activeTab: SettingsTab = isSettingsTab(params.get("tab")) ? (params.get("tab") as SettingsTab) : "general";

  function selectTab(tab: SettingsTab) {
    setParams(tab === "general" ? {} : { tab });
  }

  // /play links here as "Manage library →"; give it a way straight back.
  // The link passes its own filtered /play URL in router state, so "back"
  // restores the list as it was; a reload (no state) falls back to /play.
  const cameFromPlay = activeTab === "library" && params.get("from") === "play";
  const returnState = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const backTo = typeof returnState === "string" && returnState.startsWith("/practice") ? returnState : "/practice";

  return (
    <div className="space-y-6">
      {cameFromPlay && (
        <Link to={backTo} className="inline-flex min-h-11 items-center text-sm text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
          ← Back to songs
        </Link>
      )}
      <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
      <SegmentedControl<SettingsTab>
        aria-label="Settings sections"
        options={SETTINGS_TABS}
        value={activeTab}
        onChange={selectTab}
        block
      />
      <h2 className="sr-only">{SETTINGS_TABS.find((tab) => tab.value === activeTab)?.label}</h2>
      {activeTab === "general" && <GeneralSection />}
      {activeTab === "account" && <AccountSection />}
      {activeTab === "appearance" && <AppearanceSection />}
      {activeTab === "instruments" && <InstrumentSection />}
      {activeTab === "midi" && (
        <>
          <MidiSection />
          <Advanced fallback={<MoreOptionsRow what="Sound timing" />}>
            <AudioLatencySection />
          </Advanced>
        </>
      )}
      {activeTab === "narration" && <NarrationSection />}
      {activeTab === "library" && <SongLibrarySection />}
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import LessonListPage from "./components/lesson/LessonListPage";
import LessonPlayerPage from "./components/lesson/LessonPlayerPage";
import PracticeGymPage from "./components/midi/PracticeGymPage";
import PracticeHistoryPage from "./components/progress/PracticeHistoryPage";
import SettingsPage from "./components/settings/SettingsPage";
import AuthPage, { RegistrationForm } from "./components/auth/AuthPage";
import FeedbackWidget from "./components/feedback/FeedbackWidget";
import AdminFeedbackPage from "./components/admin/AdminFeedbackPage";
import AdminUsersPage from "./components/admin/AdminUsersPage";
import AdminSongsPage from "./components/admin/AdminSongsPage";
import SongBrowserPage from "./components/play/SongBrowserPage";
import PlayAlongPage from "./components/play/PlayAlongPage";
import SkillAssessmentPage from "./components/auth/SkillAssessmentPage";
import { useAuth } from "./contexts/AuthContext";
import { useTheme, type Theme } from "./contexts/ThemeContext";
import { applyAssessmentPlacement } from "./services/api";
import { useProgressStore } from "./state/progressStore";

type Onboarding = { step: "assessment" | "demo-account"; source: "demo" | "signup"; scores: number[] } | null;

function navLinkClasses({ isActive }: { isActive: boolean }): string {
  return `rounded-md px-2.5 py-1.5 transition-colors ${
    isActive
      ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
  }`;
}

export default function App() {
  const auth = useAuth();
  const { theme, setTheme } = useTheme();
  const resetProgress = useProgressStore((s) => s.reset);
  const [onboarding, setOnboarding] = useState<Onboarding>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);

  // Route guard: the API already 403s non-admins; this just keeps them off the pages.
  const RequireAdmin = ({ children }: { children: ReactNode }) =>
    auth.user === null ? null : auth.user.role === "admin" ? <>{children}</> : <Navigate to="/" replace />;

  if (!auth.authenticated) {
    return (
      <>
        <AuthPage onEntered={(kind) => { if (kind !== "login") setOnboarding({ step: "assessment", source: kind, scores: [] }); }} />
        <FeedbackWidget />
      </>
    );
  }

  const finishAssessment = async (scores: number[]) => {
    setPlacementError(null);
    try {
      await applyAssessmentPlacement(scores);
      resetProgress();
      setOnboarding((current) => (current?.source === "demo" ? { step: "demo-account", source: "demo", scores } : null));
    } catch (e) {
      setPlacementError(e instanceof Error ? e.message : "Unable to apply placement");
    }
  };

  if (onboarding?.step === "assessment") {
    return (
      <>
        <SkillAssessmentPage onFinish={(scores) => void finishAssessment(scores)} onSkip={() => void finishAssessment([])} />
        {placementError && (
          <p role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded bg-rose-700 px-4 py-2 text-sm text-white">
            {placementError}
          </p>
        )}
      </>
    );
  }

  if (onboarding?.step === "demo-account") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <section className="card w-full space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold">Save your progress</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Create your own account to save progress going forward. Demo progress is shared and will not be migrated.
            </p>
          </div>
          <RegistrationForm
            submitLabel="Create account and continue"
            onRegistered={() =>
              void applyAssessmentPlacement(onboarding.scores)
                .then(() => { resetProgress(); setOnboarding(null); })
                .catch((e) => setPlacementError(e instanceof Error ? e.message : "Unable to apply placement"))
            }
          />
          {placementError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{placementError}</p>}
          <button className="w-full text-sm text-felt-700 underline dark:text-felt-300" onClick={() => setOnboarding(null)}>
            Skip, keep using demo
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight">
            Keyboard <span className="text-felt-600 dark:text-felt-400">Sensei</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink to="/" end className={navLinkClasses}>Lessons</NavLink>
            <NavLink to="/practice-gym" className={navLinkClasses}>Practice Gym</NavLink>
            <NavLink to="/play" className={navLinkClasses}>Play</NavLink>
            <NavLink to="/history" className={navLinkClasses}>History</NavLink>
            <NavLink to="/settings" className={navLinkClasses}>Settings</NavLink>
            {auth.user?.role === "admin" && <NavLink to="/admin/users" className={navLinkClasses}>Admin</NavLink>}
            <label className="sr-only" htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="ml-2 rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="midnight">Midnight</option>
            </select>
            <button onClick={auth.logout} className="ml-1 rounded-md px-2.5 py-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
              Log out
            </button>
          </nav>
        </div>
        <div className="felt-strip" />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<LessonListPage />} />
          <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
          <Route path="/practice-gym" element={<PracticeGymPage />} />
          <Route path="/history" element={<PracticeHistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/play" element={<SongBrowserPage />} />
          <Route path="/play/:songId" element={<PlayAlongPage />} />
          <Route path="/admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
          <Route path="/admin/songs" element={<RequireAdmin><AdminSongsPage /></RequireAdmin>} />
          <Route path="/admin/feedback" element={<RequireAdmin><AdminFeedbackPage /></RequireAdmin>} />
        </Routes>
      </main>
      <FeedbackWidget />
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import LessonListPage from "./components/lesson/LessonListPage";
import LessonPlayerPage from "./components/lesson/LessonPlayerPage";
import PracticeGymPage from "./components/midi/PracticeGymPage";
import PracticeHistoryPage from "./components/progress/PracticeHistoryPage";
import DashboardPage from "./components/dashboard/DashboardPage";
import SettingsPage from "./components/settings/SettingsPage";
import AuthPage from "./components/auth/AuthPage";
import FeedbackWidget from "./components/feedback/FeedbackWidget";
import AdminFeedbackPage from "./components/admin/AdminFeedbackPage";
import AdminUsersPage from "./components/admin/AdminUsersPage";
import AdminSongsPage from "./components/admin/AdminSongsPage";
import SongBrowserPage from "./components/play/SongBrowserPage";
import PlayAlongPage from "./components/play/PlayAlongPage";
import SongLibraryPage from "./components/library/SongLibraryPage";
import SkillAssessmentPage from "./components/auth/SkillAssessmentPage";
import SaveProgressPage from "./components/auth/SaveProgressPage";
import { formatScoresParam, parseSourceParam } from "./components/auth/onboardingParams";
import RecordingPage from "./components/record/RecordingPage";
import AppHeader from "./components/shell/AppHeader";
import { useAuth } from "./contexts/AuthContext";
import { applyAssessmentPlacement } from "./services/api";
import { useProgressStore } from "./state/progressStore";
import AudioNoticeToasts from "./components/shell/AudioNoticeToasts";

/**
 * Page width system. Every page shares one centred column (max-w-6xl, 1152px); the
 * only exception is the Play-Along stage, which is a deliberate full-bleed
 * "performance" view so the keyboard and falling notes get the whole screen.
 */
const PAGE_WIDTH = "max-w-6xl";

/** First stop after Start Demo / Sign Up. A real route so Back and refresh behave. */
function AssessmentRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const source = parseSourceParam(params.get("from"));
  const resetProgress = useProgressStore((s) => s.reset);
  const [placementError, setPlacementError] = useState<string | null>(null);

  const finish = async (scores: number[]) => {
    setPlacementError(null);
    try {
      await applyAssessmentPlacement(scores);
      resetProgress();
      if (source === "demo") {
        navigate(`/welcome/save-progress?scores=${formatScoresParam(scores)}`, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e) {
      setPlacementError(e instanceof Error ? e.message : "Unable to apply placement");
    }
  };

  return (
    <>
      <SkillAssessmentPage onFinish={(scores) => void finish(scores)} onSkip={() => void finish([])} />
      {placementError && (
        <p role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded bg-rose-700 px-4 py-2 text-sm text-white">
          {placementError}
        </p>
      )}
    </>
  );
}

export default function App() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // The Play-Along stage fills the viewport; everything else is a normal scrolling page.
  const isPerformanceView = useMatch("/play/:songId") !== null;

  // Route guard: the API already 403s non-admins; this just keeps them off the pages.
  const RequireAdmin = ({ children }: { children: ReactNode }) =>
    auth.user === null ? null : auth.user.role === "admin" ? <>{children}</> : <Navigate to="/" replace />;

  if (!auth.authenticated) {
    return (
      <>
        <AuthPage
          onEntered={(kind) => {
            if (kind !== "login") navigate(`/welcome/assessment?from=${kind}`);
          }}
        />
        <FeedbackWidget />
      </>
    );
  }

  return (
    <div className={isPerformanceView ? "flex h-dvh flex-col" : "min-h-screen"}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-felt-700 focus:shadow-lg dark:focus:bg-slate-900 dark:focus:text-felt-300"
      >
        Skip to content
      </a>
      <AppHeader
        isAdmin={auth.user?.role === "admin"}
        onLogout={auth.logout}
        onOpenFeedback={isPerformanceView ? () => setFeedbackOpen(true) : undefined}
        widthClassName={isPerformanceView ? "" : PAGE_WIDTH}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className={
          isPerformanceView
            ? "flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 outline-none sm:px-4"
            : `mx-auto w-full ${PAGE_WIDTH} px-4 pb-24 pt-6 outline-none`
        }
      >
        <Routes>
          <Route path="/" element={<LessonListPage />} />
          <Route path="/welcome/assessment" element={<AssessmentRoute />} />
          <Route path="/welcome/save-progress" element={<SaveProgressPage />} />
          <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
          <Route path="/practice-gym" element={<PracticeGymPage />} />
          <Route path="/record" element={<RecordingPage />} />
          <Route path="/history" element={<PracticeHistoryPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/play" element={<SongBrowserPage />} />
          <Route path="/library" element={<SongLibraryPage />} />
          <Route path="/play/:songId" element={<PlayAlongPage />} />
          <Route path="/admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
          <Route path="/admin/songs" element={<RequireAdmin><AdminSongsPage /></RequireAdmin>} />
          <Route path="/admin/feedback" element={<RequireAdmin><AdminFeedbackPage /></RequireAdmin>} />
        </Routes>
      </main>
      <FeedbackWidget open={feedbackOpen} onOpenChange={setFeedbackOpen} showLauncher={!isPerformanceView} />
      <AudioNoticeToasts />
    </div>
  );
}

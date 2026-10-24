import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import LessonListPage from "./components/lesson/LessonListPage";
import LessonPlayerPage from "./components/lesson/LessonPlayerPage";
import ProgressPage from "./components/progress/ProgressPage";
import TodayPage from "./components/today/TodayPage";
import PracticePage from "./components/practice/PracticePage";
import NoteReadingGame from "./components/games/NoteReadingGame";
import DailyChallengePage from "./components/challenge/DailyChallengePage";
import DailyGoalPage from "./components/auth/DailyGoalPage";
import FirstStepsPage from "./components/auth/FirstStepsPage";
import SettingsPage from "./components/settings/SettingsPage";
import AuthPage from "./components/auth/AuthPage";
import FeedbackWidget from "./components/feedback/FeedbackWidget";
import AdminFeedbackPage from "./components/admin/AdminFeedbackPage";
import AdminUsersPage from "./components/admin/AdminUsersPage";
import AdminSongsPage from "./components/admin/AdminSongsPage";
import CataloguePage from "./components/admin/CataloguePage";
import PlayAlongPage from "./components/play/PlayAlongPage";
import SongLibraryPage from "./components/library/SongLibraryPage";
import SkillAssessmentPage from "./components/auth/SkillAssessmentPage";
import SaveProgressPage from "./components/auth/SaveProgressPage";
import { formatScoresParam, parseSourceParam } from "./components/auth/onboardingParams";
import AppNavigation from "./components/shell/AppHeader";
import { ToastProvider } from "./components/ui/Toast";
import { exitFocusMode } from "./hooks/useFocusMode";
import RewardToasts from "./components/shell/RewardToasts";
import { useAuth } from "./contexts/AuthContext";
import { applyAssessmentPlacement, updateTimezone } from "./services/api";
import { useProgressStore } from "./state/progressStore";
import AudioNoticeToasts from "./components/shell/AudioNoticeToasts";
import { useNativeKeepAwake } from "./native/nativeShell";
import PrivacyPage from "./components/legal/PrivacyPage";
import TermsPage from "./components/legal/TermsPage";
import DeleteAccountPage from "./components/legal/DeleteAccountPage";
import ThirdPartyLicensesPage from "./components/legal/ThirdPartyLicensesPage";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./components/auth/AccountRecoveryPages";

// Dev-only component kit page. The condition is a build-time constant, so production
// bundles drop the import entirely.
const KitPreview = import.meta.env.DEV ? lazy(() => import("./components/ui/KitPreview")) : null;

/**
 * Pages that work signed in or out, outside the app shell: the policies and account
 * deletion (Google Play links to /privacy and /delete-account), and the pages emailed
 * links land on.
 */
const PUBLIC_PAGES: Record<string, () => JSX.Element> = {
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
  "/third-party-licenses": ThirdPartyLicensesPage,
  "/delete-account": DeleteAccountPage,
  "/forgot-password": ForgotPasswordPage,
  "/reset-password": ResetPasswordPage,
  "/verify-email": VerifyEmailPage,
};

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
        navigate("/welcome/goal", { replace: true });
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

/**
 * Old addresses (bookmarks, the installed PWA, links in old feedback) keep working:
 * each one redirects to where its page lives now, keeping its query string.
 */
function Redirect({ to, params }: { to: string; params?: Record<string, string> }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(params ?? {})) search.set(key, value);
  const query = search.toString();
  return <Navigate to={`${to}${query ? `?${query}` : ""}`} replace />;
}

/** Days and streaks follow the learner's own midnight: tell the API which zone that is. */
function useReportTimezone(user: { timezone?: string | null } | null) {
  useEffect(() => {
    if (!user) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && zone !== user.timezone) void updateTimezone(zone).catch(() => undefined);
  }, [user]);
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

/**
 * Route guard: the API already 403s non-admins; this just keeps them off the pages.
 * Declared at module scope: a component defined inside AppShell would be a new type on
 * every shell render, remounting the admin page (and losing its state) each time.
 */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user === null) return null;
  return user.role === "admin" ? <>{children}</> : <Navigate to="/" replace />;
}

function AppShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useNativeKeepAwake();
  // The Play-Along stage fills the viewport; everything else is a normal scrolling page.
  const isAdmin = auth.user?.role === "admin";
  const isPerformanceView = useMatch("/play/:songId") !== null;
  useReportTimezone(auth.user);

  // Focus mode belongs to the screen that asked for it: navigating away ends it.
  useEffect(() => exitFocusMode(), [location.pathname]);

  const PublicPage = PUBLIC_PAGES[location.pathname.replace(/\/+$/, "") || "/"];
  if (PublicPage) return <PublicPage />;

  if (!auth.authenticated) {
    return (
      <AuthPage
        onEntered={(kind) => {
          // Signing in lands on Today; a new account goes through onboarding first.
          navigate(kind === "login" ? "/" : `/welcome/assessment?from=${kind}`, { replace: kind === "login" });
        }}
      />
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
      <AppNavigation
        performanceView={isPerformanceView}
        isAdmin={isAdmin}
        displayName={auth.user?.display_name ?? null}
        onLogout={auth.logout}
        onOpenFeedback={() => setFeedbackOpen(true)}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className={
          isPerformanceView
            ? "flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 outline-none sm:px-4"
            : `ks-shell-main mx-auto w-full ${PAGE_WIDTH} px-4 outline-none`
        }
      >
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/learn" element={<LessonListPage />} />
          <Route path="/welcome/assessment" element={<AssessmentRoute />} />
          <Route path="/welcome/save-progress" element={<SaveProgressPage />} />
          <Route path="/welcome/first-steps" element={<FirstStepsPage />} />
          <Route path="/welcome/goal" element={<DailyGoalPage />} />
          <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
          <Route path="/practice" element={<PracticePage tab="songs" />} />
          <Route path="/practice/gym" element={<PracticePage tab="gym" />} />
          <Route path="/practice/record" element={<PracticePage tab="record" />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/play/:songId" element={<PlayAlongPage />} />
          {/* New screens: register their routes here, above the redirects. */}
          <Route path="/practice/notes" element={<NoteReadingGame />} />
          <Route path="/challenge" element={<DailyChallengePage />} />
          {KitPreview && (
            <Route
              path="/dev/kit"
              element={
                <Suspense fallback={null}>
                  <KitPreview />
                </Suspense>
              }
            />
          )}
          {/* Old addresses. */}
          <Route path="/play" element={<Redirect to="/practice" />} />
          <Route path="/practice-gym" element={<Redirect to="/practice/gym" />} />
          <Route path="/record" element={<Redirect to="/practice/record" />} />
          <Route path="/history" element={<Redirect to="/progress" params={{ tab: "history" }} />} />
          <Route path="/dashboard" element={<Redirect to="/progress" />} />
          <Route path="/lessons" element={<Redirect to="/learn" />} />
          <Route path="/library" element={<SongLibraryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
          <Route path="/admin/songs" element={<RequireAdmin><AdminSongsPage /></RequireAdmin>} />
          <Route path="/admin/catalogue" element={<RequireAdmin><CataloguePage /></RequireAdmin>} />
          <Route path="/admin/feedback" element={<RequireAdmin><AdminFeedbackPage /></RequireAdmin>} />
        </Routes>
      </main>
      <FeedbackWidget
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        showLauncher={isAdmin && !isPerformanceView}
      />
      <AudioNoticeToasts />
      <RewardToasts />
    </div>
  );
}

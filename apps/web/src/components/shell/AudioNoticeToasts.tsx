import { dismissAudioNotice, useAudioNotices } from "../../audio/audioNotices";

/** Small dismissible notices for audio problems, e.g. an instrument that failed to load. */
export default function AudioNoticeToasts() {
  const notices = useAudioNotices();
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 left-4 z-50 flex max-w-sm nav:bottom-4 flex-col gap-2" aria-live="polite">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-lg border border-brass-400/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-lg dark:border-brass-600/50 dark:bg-slate-900 dark:text-slate-200"
        >
          <span className="flex-1">{notice.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
            onClick={() => dismissAudioNotice(notice.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

import { Link } from "react-router-dom";
import SongBrowserPage from "../play/SongBrowserPage";
import PracticeGymPage from "../midi/PracticeGymPage";
import RecordingPage from "../record/RecordingPage";

export type PracticeTab = "songs" | "gym" | "record";

const TABS: { id: PracticeTab; label: string; to: string }[] = [
  { id: "songs", label: "Songs", to: "/practice" },
  { id: "gym", label: "Practice Gym", to: "/practice/gym" },
  { id: "record", label: "Record", to: "/practice/record" },
];

/**
 * Practice: the song library, the Practice Gym and Record, as tabs. Each tab is its own
 * URL (/practice, /practice/gym, /practice/record), so Back, bookmarks and deep links
 * like /practice/gym?drill=… work.
 */
export default function PracticePage({ tab }: { tab: PracticeTab }) {
  return (
    <div className="space-y-5">
      <nav aria-label="Practice" className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            aria-current={tab === item.id ? "page" : undefined}
            className={`rounded-t-md px-3 py-2 text-sm transition-colors ${
              tab === item.id
                ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "songs" && <SongBrowserPage />}
      {tab === "gym" && <PracticeGymPage />}
      {tab === "record" && <RecordingPage />}
    </div>
  );
}

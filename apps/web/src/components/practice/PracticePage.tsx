import { useNavigate } from "react-router-dom";
import { SegmentedControl } from "../ui";
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
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <SegmentedControl<PracticeTab>
        aria-label="Practice"
        block
        options={TABS.map(({ id, label }) => ({ value: id, label }))}
        value={tab}
        onChange={(id) => navigate(TABS.find((item) => item.id === id)?.to ?? "/practice")}
      />
      {tab === "songs" && <SongBrowserPage />}
      {tab === "gym" && <PracticeGymPage />}
      {tab === "record" && <RecordingPage />}
    </div>
  );
}

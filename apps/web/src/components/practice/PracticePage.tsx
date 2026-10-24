import { useNavigate } from "react-router-dom";
import { SegmentedControl } from "../ui";
import SongBrowserPage from "../play/SongBrowserPage";
import PracticeGymPage from "../midi/PracticeGymPage";
import RecordingPage from "../record/RecordingPage";

export type PracticeTab = "songs" | "gym" | "record";

/** Songs is the Library tab of the main navigation; the switcher is for the other practice tools. */

const TABS: { id: PracticeTab; label: string; to: string }[] = [
  { id: "gym", label: "Practice Gym", to: "/practice/gym" },
  { id: "record", label: "Record", to: "/practice/record" },
];

/**
 * Practice: the Practice Gym and Record as a switcher, plus the song library (reached from
 * the Library tab, so it carries no switcher). Each tab is its own URL (/practice, /practice/gym, /practice/record), so Back, bookmarks and deep links
 * like /practice/gym?drill=… work.
 */
export default function PracticePage({ tab }: { tab: PracticeTab }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      {tab !== "songs" && (
        <SegmentedControl<PracticeTab>
          aria-label="Practice"
          block
          options={TABS.map(({ id, label }) => ({ value: id, label }))}
          value={tab}
          onChange={(id) => navigate(TABS.find((item) => item.id === id)?.to ?? "/practice/gym")}
        />
      )}
      {tab === "songs" && <SongBrowserPage />}
      {tab === "gym" && <PracticeGymPage />}
      {tab === "record" && <RecordingPage />}
    </div>
  );
}

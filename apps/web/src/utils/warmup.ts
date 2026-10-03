import { practiceGymDrills, type PracticeGymDrill } from "../data/practiceGymDrills";

/**
 * The Today screen's warm-up: one Practice Gym drill, matched to the player's level and
 * rotated by day so it isn't the same drill every morning. Novices get single-note
 * drills (the five-finger pattern, the C–G interval); from Apprentice on, chords join in.
 */
const NOVICE_DRILLS = ["gym-five-finger", "gym-c-g-interval"];
const LATER_DRILLS = ["gym-cmaj-triad", "gym-amin-triad", "gym-c-g-interval", "gym-five-finger"];

export function warmupFor(playerLevel: number, day: string): PracticeGymDrill {
  const ids = playerLevel < 6 ? NOVICE_DRILLS : LATER_DRILLS;
  const dayNumber = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000) || 0;
  const id = ids[dayNumber % ids.length]!;
  return practiceGymDrills.find((drill) => drill.id === id) ?? practiceGymDrills[0]!;
}

import {
  DEFAULT_PLAYED_INSTRUMENT,
  isPlayedInstrument,
  lessonInstrument,
  PLAYED_INSTRUMENTS,
  type PlayedInstrument,
} from "@keyboard-sensei/shared-types";
import { t } from "../i18n";

export const INSTRUMENT_LABEL: Record<PlayedInstrument, string> = {
  get piano() { return t("played.piano"); },
  get guitar() { return t("played.guitar"); },
  get violin() { return t("played.violin"); },
};

/** Learn, Today and the gym show only the lessons for the instrument being played; a lesson with no instrument is piano. */
export function filterByInstrument<T extends { instrument?: PlayedInstrument }>(lessons: readonly T[], active: PlayedInstrument): T[] {
  return lessons.filter((lesson) => lessonInstrument(lesson) === active);
}

/** Keeps known instruments only, in the picker's order, without duplicates. */
export function normalizePlayed(value: unknown): PlayedInstrument[] {
  if (!Array.isArray(value)) return [];
  return PLAYED_INSTRUMENTS.filter((instrument) => value.includes(instrument));
}

export function parseActive(value: unknown): PlayedInstrument {
  return isPlayedInstrument(value) ? value : DEFAULT_PLAYED_INSTRUMENT;
}

export interface NarrationVoiceOption {
  id: string;
  name: string;
  description: string;
  /** Public ElevenLabs preview sample — free to play, does not count against the narration character quota. */
  previewUrl: string;
}

/**
 * Curated subset of ElevenLabs premade voices, picked for a warm/friendly
 * "piano teacher" tone. Only voices with stable storage.googleapis.com
 * preview URLs are included — a few ElevenLabs voices serve preview audio
 * from signed, time-limited API URLs instead, which isn't safe to hardcode.
 */
export const NARRATION_VOICES: NarrationVoiceOption[] = [
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice",
    description: "Clear, engaging educator",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/Xb7hH8MSUJpSbSDYk0k2/d10f7534-11f6-41fe-a012-2de1e482d336.mp3",
  },
  {
    id: "hpp4J3VqNfWAUOO0d1Us",
    name: "Bella",
    description: "Professional, bright, warm",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3",
  },
  {
    id: "XrExE9yKIg1WjnnlVkGX",
    name: "Matilda",
    description: "Knowledgeable, upbeat",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3",
  },
  {
    id: "cjVigY5qzO86Huf0OWal",
    name: "Eric",
    description: "Smooth, trustworthy",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3",
  },
];

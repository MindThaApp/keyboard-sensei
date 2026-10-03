/**
 * The scores of the authored Essentials pieces, by slug. Each file holds one
 * piece; its provenance and verification record is its manifest entry.
 */
import { auldLangSyne } from "./auld-lang-syne.js";
import { bridalChorus } from "./bridal-chorus.js";
import { canCan } from "./can-can.js";
import { carolOfTheBells } from "./carol-of-the-bells.js";
import { dannyBoy } from "./danny-boy.js";
import { deckTheHalls } from "./deck-the-halls.js";
import { godRestYeMerryGentlemen } from "./god-rest-ye-merry-gentlemen.js";
import { habanera } from "./habanera.js";
import { happyBirthday } from "./happy-birthday.js";
import { hungarianDance5 } from "./hungarian-dance-5.js";
import { jesuJoy } from "./jesu-joy.js";
import { jingleBells } from "./jingle-bells.js";
import { laDonnaEMobile } from "./la-donna-e-mobile.js";
import { morningMood } from "./morning-mood.js";
import { newWorldLargo } from "./new-world-largo.js";
import type { AuthoredScore } from "./notation.js";
import { pompAndCircumstance1 } from "./pomp-and-circumstance-1.js";
import { radetzkyMarch } from "./radetzky-march.js";
import { scarboroughFair } from "./scarborough-fair.js";
import { shenandoah } from "./shenandoah.js";
import { sugarPlumFairy } from "./sugar-plum-fairy.js";
import { swanLakeTheme } from "./swan-lake-theme.js";
import { twinkleTwinkleLittleStar } from "./twinkle-twinkle-little-star.js";
import { weWishYouAMerryChristmas } from "./we-wish-you-a-merry-christmas.js";
import { whenTheSaintsGoMarchingIn } from "./when-the-saints-go-marching-in.js";

export const AUTHORED_SCORES: Record<string, AuthoredScore> = {
  "twinkle-twinkle-little-star": twinkleTwinkleLittleStar,
  "happy-birthday": happyBirthday,
  "jingle-bells": jingleBells,
  "deck-the-halls": deckTheHalls,
  "we-wish-you-a-merry-christmas": weWishYouAMerryChristmas,
  "god-rest-ye-merry-gentlemen": godRestYeMerryGentlemen,
  "carol-of-the-bells": carolOfTheBells,
  "auld-lang-syne": auldLangSyne,
  "danny-boy": dannyBoy,
  "scarborough-fair": scarboroughFair,
  shenandoah,
  "when-the-saints-go-marching-in": whenTheSaintsGoMarchingIn,
  "can-can": canCan,
  "radetzky-march": radetzkyMarch,
  "pomp-and-circumstance-1": pompAndCircumstance1,
  "bridal-chorus": bridalChorus,
  "la-donna-e-mobile": laDonnaEMobile,
  habanera,
  "new-world-largo": newWorldLargo,
  "jesu-joy-of-mans-desiring": jesuJoy,
  "swan-lake-theme": swanLakeTheme,
  "morning-mood": morningMood,
  "hungarian-dance-5": hungarianDance5,
  "sugar-plum-fairy": sugarPlumFairy,
};

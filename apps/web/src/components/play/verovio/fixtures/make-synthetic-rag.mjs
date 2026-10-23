// Generates synthetic-rag.musicxml: a deterministic, copyright-free piano score of
// about the size and density of a ragtime piece (100 bars of 2/4, two staves, ~2,400
// notes), used to measure how long engraving blocks. Run: node make-synthetic-rag.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const note = (index, octaveBase, type, duration, { chord = false, staff, voice }) => {
  const step = STEPS[((index % 7) + 7) % 7];
  const octave = octaveBase + Math.floor(index / 7);
  return `<note>${chord ? "<chord/>" : ""}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`;
};

const measures = [];
for (let bar = 0; bar < 100; bar += 1) {
  const seed = (bar * 7) % 11;
  let rightHand = "";
  for (let beat = 0; beat < 8; beat += 1) {
    const index = 2 + ((seed + beat * 3 + (beat % 2) * 2) % 9);
    rightHand += note(index, 4, "16th", 1, { staff: 1, voice: 1 });
    if (beat % 4 === 0) rightHand += note(index - 2, 4, "16th", 1, { chord: true, staff: 1, voice: 1 });
  }
  let leftHand = "";
  for (let beat = 0; beat < 4; beat += 1) {
    const index = (bar + beat * 2) % 5;
    leftHand += note(index, 2, "eighth", 2, { staff: 2, voice: 2 });
    leftHand += note(index + 4, 2, "eighth", 2, { chord: true, staff: 2, voice: 2 });
  }
  const attributes =
    bar === 0
      ? `<attributes><divisions>4</divisions><key><fifths>-3</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`
      : "";
  measures.push(`<measure number="${bar + 1}">${attributes}${rightHand}<backup><duration>8</duration></backup>${leftHand}</measure>`);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><work><work-title>Synthetic rag (test score)</work-title></work><identification><rights>CC0 1.0: generated test data</rights></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures.join("\n")}</part></score-partwise>
`;
writeFileSync(fileURLToPath(new URL("./synthetic-rag.musicxml", import.meta.url)), xml);

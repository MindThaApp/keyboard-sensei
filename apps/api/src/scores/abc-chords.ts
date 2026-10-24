/**
 * Verovio's ABC reader ignores a length written after a chord's closing bracket
 * (`[CEG]2`, `[CEG]3/2-`), so such a chord comes out as short as its first note's
 * default length. Standard ABC multiplies each note's own length by it; this does that
 * in the text (`[C2E2G2]`), leaving everything else, including inline fields such as
 * `[K:D]`, as written.
 */

type Fraction = [number, number];
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** An ABC length multiplier: "", "3", "/", "/4", "3/2", "//" ... */
function parseLength(text: string): Fraction {
  if (text === "") return [1, 1];
  const match = /^(\d*)((?:\/\d*)*)$/.exec(text);
  if (!match) return [1, 1];
  let numerator = match[1] === "" ? 1 : Number(match[1]);
  let denominator = 1;
  for (const slash of match[2].split("/").slice(1)) denominator *= slash === "" ? 2 : Number(slash);
  const divisor = gcd(numerator, denominator) || 1;
  numerator /= divisor;
  denominator /= divisor;
  return [numerator, denominator];
}

function formatLength([numerator, denominator]: Fraction): string {
  if (denominator === 1) return numerator === 1 ? "" : String(numerator);
  return numerator === 1 ? `/${denominator}` : `${numerator}/${denominator}`;
}

const NOTE = /^([_^=]*[A-Ga-g][,']*)(\d*(?:\/\d*)*)(-?)/;

function scaleChord(inner: string, outer: Fraction, tie: string): string | null {
  let rest = inner;
  let out = "";
  while (rest.length > 0) {
    const note = NOTE.exec(rest);
    if (!note) return null; // anything but plain notes (decorations, spaces): leave the chord alone
    const own = parseLength(note[2]);
    const product: Fraction = [own[0] * outer[0], own[1] * outer[1]];
    const divisor = gcd(product[0], product[1]) || 1;
    out += `${note[1]}${formatLength([product[0] / divisor, product[1] / divisor])}${note[3] || tie}`;
    rest = rest.slice(note[0].length);
  }
  return out;
}

export function normalizeAbcChords(abc: string): string {
  return abc
    .split(/(\r\n|\r|\n)/)
    .map((line) =>
      // Only music lines: header and other field lines (`K:D`, `w:` lyrics) and comments are left alone.
      /^\s*(%|[A-Za-z+]:)/.test(line) ? line : line.replace(/\[([^\][\s:]+)\](\d*(?:\/\d*)*)(-?)/g, (all, inner: string, length: string, tie: string) => {
        if (length === "" && tie === "") return all;
        const scaled = scaleChord(inner, parseLength(length), tie);
        return scaled === null ? all : `[${scaled}]`;
      }),
    )
    .join("");
}

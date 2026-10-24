import { DOMParser, type Element } from "@xmldom/xmldom";

/**
 * The time signature in force in each printed measure of an MEI score, in score order,
 * read from its own scoreDef/staffDef/meterSig elements. Verovio's MIDI places meter
 * changes by the printed score and drops a pickup's real length, so for the formats
 * that have no MusicXML to read this from (ABC, **kern) the play-along grid is rebuilt
 * from these (see rewriteTimeSignatures).
 */
export function meiMeasureMeters(mei: string): { meter: [number, number] | null }[] {
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(mei, "text/xml");
  const out: { meter: [number, number] | null }[] = [];
  let current: [number, number] | null = null;

  const meterOf = (element: Element): [number, number] | null => {
    const count = element.getAttribute(element.nodeName === "meterSig" ? "count" : "meter.count");
    const unit = element.getAttribute(element.nodeName === "meterSig" ? "unit" : "meter.unit");
    if (count && unit && /^\d+$/.test(count) && /^\d+$/.test(unit) && Number(count) > 0 && Number(unit) > 0) return [Number(count), Number(unit)];
    const sym = element.getAttribute(element.nodeName === "meterSig" ? "sym" : "meter.sym");
    return sym === "common" ? [4, 4] : sym === "cut" ? [2, 2] : null;
  };

  const walk = (element: Element) => {
    if (element.nodeName === "scoreDef" || element.nodeName === "staffDef" || element.nodeName === "meterSig") current = meterOf(element) ?? current;
    if (element.nodeName === "measure") {
      // A meter written at the start of the measure's own staves applies to it.
      for (const sig of Array.from(element.getElementsByTagName("meterSig"))) current = meterOf(sig) ?? current;
      out.push({ meter: current });
      return;
    }
    for (let node = element.firstChild; node; node = node.nextSibling) if (node.nodeType === 1) walk(node as Element);
  };
  if (doc.documentElement) walk(doc.documentElement);
  return out;
}

/**
 * Verovio's SVG for a user's own score. Verovio writes the SVG itself (it never passes
 * markup through), but an MEI can carry links (`ref@target`) and the like, and admins
 * can open other users' uploads, so nothing that can run or navigate is let into the
 * page: no scripts, foreign objects or event handlers, and only in-document references.
 */
const BLOCKED_ELEMENTS = new Set(["script", "foreignobject", "iframe", "object", "embed", "style"]);

function clean(element: Element) {
  for (const child of Array.from(element.children)) {
    const name = child.localName.toLowerCase();
    // Verovio's own <style> is the score's CSS, scoped to the SVG's id; keep it.
    if (BLOCKED_ELEMENTS.has(name) && !(name === "style" && element.localName === "svg")) {
      child.remove();
      continue;
    }
    if (name === "a") {
      // Keep the text, drop the link.
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    clean(child);
  }
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const isReference = name === "href" || name === "xlink:href" || name === "src";
    if (name.startsWith("on") || (isReference && !attribute.value.startsWith("#"))) element.removeAttribute(attribute.name);
  }
}

/** Parses one page of Verovio SVG into a cleaned, insertable element (null if it isn't SVG). */
export function safeSvgPage(markup: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (root.localName !== "svg" || doc.getElementsByTagName("parsererror").length > 0) return null;
  clean(root);
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

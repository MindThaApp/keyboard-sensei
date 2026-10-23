/** Descriptions are stored as "Name — what it sounds like"; the row already shows the name. */
export function describeInstrument(instrument: { name: string; description: string }): string {
  const prefix = /^(.+?)\s+[\u2014\u2013-]\s+/.exec(instrument.description);
  if (prefix && prefix[1].trim().toLowerCase() === instrument.name.trim().toLowerCase()) {
    return instrument.description.slice(prefix[0].length);
  }
  return instrument.description;
}

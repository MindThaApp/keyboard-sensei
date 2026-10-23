/**
 * Third-party material that isn't an npm package: sample sets and other media the app
 * ships or serves. npm packages are collected automatically; anything else is listed
 * here, by hand, with the licence checked at its source.
 *
 * To add one, append an entry. Verovio (LGPL-3.0-or-later)
 * needs nothing here if it arrives as an npm dependency: the collector picks it up.
 */
export interface ThirdPartyAsset {
  name: string;
  /** What it is used for in the app. */
  usedFor: string;
  /** SPDX id(s) where one exists. */
  license: string;
  /** Credit line to display (required for CC BY / CC BY-SA). */
  attribution: string;
  url: string;
  licenseUrl: string;
}

export const THIRD_PARTY_ASSETS: ThirdPartyAsset[] = [
  {
    name: "FluidR3 GM SoundFont (MIDI.js renders)",
    usedFor: "The sampled instruments (piano, keys and the other General MIDI sounds)",
    // gleitz/midi-js-soundfonts README: the FluidR3_GM renders are "Released under
    // Creative Commons Attribution 3.0 license". The repository's own code is MIT, and
    // the original FluidR3_GM.sf2 (Frank Wen and contributors) is distributed under MIT.
    license: "CC-BY-3.0",
    attribution:
      "Instrument samples rendered from the Fluid R3 General MIDI SoundFont by Frank Wen and contributors, via Benjamin Gleitzman's midi-js-soundfonts (github.com/gleitz/midi-js-soundfonts), licensed CC BY 3.0.",
    url: "https://github.com/gleitz/midi-js-soundfonts",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/us/",
  },
  {
    name: "Versilian Community Sample Library (VCSL), Grand Piano Steinway B",
    usedFor: "The Studio Grand piano voice (recorded Steinway B with touch layers and damper release)",
    // sgossner/VCSL README: "a Creative Commons 0 license ... no royalties, no credit, no special terms".
    // Credit is given anyway: the recordings are other people's work.
    license: "CC0-1.0",
    attribution:
      "Steinway B piano recordings from the Versilian Community Sample Library (VCSL) by Versilian Studios LLC and contributors (github.com/sgossner/VCSL), released under CC0 1.0 (public domain dedication). Credit is given with thanks, not because the licence requires it.",
    url: "https://github.com/sgossner/VCSL",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
];

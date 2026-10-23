import plugin from "tailwindcss/plugin";

/** A token colour that accepts Tailwind's opacity modifier (`bg-tint/20`). */
const token = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

/** A type-scale step: size and line height from tokens.css (they shrink in compact density). */
const typeStep = (name, fontWeight) => [`var(--fs-${name})`, { lineHeight: `var(--lh-${name})`, fontWeight }];

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  // The Neon 3D renderer is WebGL and shader source with no class names; scanning it
  // turned GLSL tokens such as `!input` into ~1 KB of unused utilities.
  content: ["./index.html", "./src/**/*.{ts,tsx}", "!./src/components/play/renderers/neon3d/**"],
  theme: {
    extend: {
      screens: {
        // Where the header's inline links stop fitting and collapse behind a Menu button.
        nav: "900px",
      },
      colors: {
        // Design tokens (src/styles/tokens.css). Components use these, never raw colours.
        tint: {
          DEFAULT: token("tint"),
          fill: token("tint-fill"),
          pressed: token("tint-pressed"),
          soft: "var(--tint-soft)",
        },
        "on-tint": token("on-tint"),
        bg: {
          DEFAULT: token("bg"),
          grouped: token("bg-grouped"),
          elevated: token("bg-elevated"),
        },
        cell: token("cell"),
        label: {
          DEFAULT: token("label"),
          2: token("label-2"),
          "2a": token("label-2a"),
          3: token("label-3"),
        },
        fill: {
          DEFAULT: "var(--fill)",
          strong: "var(--fill-strong)",
        },
        separator: {
          DEFAULT: "var(--separator)",
          opaque: "var(--separator-opaque)",
        },
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        hand: {
          right: token("hand-right"),
          left: token("hand-left"),
        },
        "glass-selection": "var(--glass-selection)",

        ink: "#1f2933",
        // Legacy accent scale, now an alias of the tint (felt-600 = tint-fill); removed
        // once every screen has adopted the tokens above.
        felt: {
          50: "rgb(var(--color-felt-50) / <alpha-value>)",
          100: "rgb(var(--color-felt-100) / <alpha-value>)",
          300: "rgb(var(--color-felt-300) / <alpha-value>)",
          400: "rgb(var(--color-felt-400) / <alpha-value>)",
          500: "rgb(var(--color-felt-500) / <alpha-value>)",
          600: "rgb(var(--color-felt-600) / <alpha-value>)",
          700: "rgb(var(--color-felt-700) / <alpha-value>)",
          800: "rgb(var(--color-felt-800) / <alpha-value>)",
          900: "rgb(var(--color-felt-900) / <alpha-value>)",
        },
        // Legacy: removed after adoption (brass-700 → warning).
        brass: {
          100: "#f7edcd",
          300: "#dfc266",
          400: "#d1ad3d",
          500: "#c9a227",
          600: "#a98720",
          // Darkened from #87691b (4.4:1 on brass-100) so brass-700 text passes AA on it.
          700: "#7a5f18",
        },
        // Legacy score paper.
        ivory: {
          50: "#fbf9f3",
          100: "#f6f2e8",
          200: "#ece5d3",
        },
      },
      // Text-only overrides for the two "muted" greys. Stock slate-400 measured 2.2–2.6:1
      // on white and stock slate-500 3.1–3.8:1 on the dark surfaces, so every helper
      // line, locked-lesson meta and hint failed WCAG AA. Re-pointing the tokens (only for
      // text-* utilities — borders and backgrounds keep the stock greys) fixes all ~160
      // call sites at once; the per-theme values live in index.css.
      textColor: {
        slate: {
          400: "rgb(var(--text-slate-400) / <alpha-value>)",
          500: "rgb(var(--text-slate-500) / <alpha-value>)",
        },
        felt: {
          400: "rgb(var(--text-felt-400) / <alpha-value>)",
        },
      },
      fontFamily: {
        text: "var(--font-text)",
        display: "var(--font-display)",
        rounded: "var(--font-rounded)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        "large-title": typeStep("large-title", "800"),
        title1: typeStep("title1", "700"),
        title2: typeStep("title2", "700"),
        title3: typeStep("title3", "600"),
        headline: typeStep("headline", "600"),
        body: typeStep("body", "400"),
        callout: typeStep("callout", "400"),
        subhead: typeStep("subhead", "400"),
        footnote: typeStep("footnote", "400"),
        caption: typeStep("caption", "400"),
      },
      borderRadius: {
        control: "var(--r-control)",
        card: "var(--r-card)",
        group: "var(--r-group)",
        sheet: "var(--r-sheet)",
        pill: "var(--r-pill)",
      },
      spacing: {
        gutter: "var(--gutter)",
        hit: "var(--hit-min)",
        "control-sm": "var(--control-h-sm)",
        control: "var(--control-h)",
        "control-lg": "var(--control-h-lg)",
        tabbar: "var(--tabbar-h)",
        toolbar: "var(--toolbar-h)",
      },
      minHeight: { hit: "var(--hit-min)" },
      minWidth: { hit: "var(--hit-min)" },
      maxWidth: { content: "var(--content-max)" },
      boxShadow: {
        key: "0 1px 2px rgba(15, 23, 42, 0.25), 0 3px 6px rgba(15, 23, 42, 0.12)",
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        glass: "var(--glass-shadow)",
      },
      transitionTimingFunction: {
        spring: "var(--spring)",
        smooth: "var(--ease-out)",
      },
      transitionDuration: {
        spring: "var(--dur-spring)",
        fade: "var(--dur-fade)",
        base: "var(--dur-base)",
      },
    },
  },
  plugins: [
    // Layout branches on device class and density, set on <html> by appearance.ts:
    // `compact:px-4`, `phone:hidden`, `desktop:grid-cols-3`.
    plugin(({ addVariant }) => {
      addVariant("compact", ':root[data-density="compact"] &');
      addVariant("regular", ':root[data-density="regular"] &');
      addVariant("phone", ':root[data-device="phone"] &');
      addVariant("tablet", ':root[data-device="tablet"] &');
      addVariant("desktop", ':root[data-device="desktop"] &');
      addVariant("solid-glass", ":root.appearance-solid &");
    }),
  ],
};

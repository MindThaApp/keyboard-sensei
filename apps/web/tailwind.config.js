/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        // Where the header's inline links stop fitting and collapse behind a Menu button.
        nav: "900px",
      },
      colors: {
        ink: "#1f2933",
        // The crimson felt strip that runs behind a piano's keys — primary accent.
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
        // Brass pedals and hinges — achievement and completed states.
        brass: {
          100: "#f7edcd",
          300: "#dfc266",
          400: "#d1ad3d",
          500: "#c9a227",
          600: "#a98720",
          700: "#87691b",
        },
        // Score paper.
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
        display: ['"Iowan Old Style"', '"Palatino Linotype"', "Palatino", "Georgia", "serif"],
      },
      boxShadow: {
        key: "0 1px 2px rgba(15, 23, 42, 0.25), 0 3px 6px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};

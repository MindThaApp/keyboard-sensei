/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        // The crimson felt strip that runs behind a piano's keys — primary accent.
        felt: {
          50: "#fdf3f4",
          100: "#f9e1e3",
          300: "#e0808b",
          400: "#cf5260",
          500: "#c43d49",
          600: "#b4323e",
          700: "#962832",
          800: "#7a222b",
          900: "#621d24",
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

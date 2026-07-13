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

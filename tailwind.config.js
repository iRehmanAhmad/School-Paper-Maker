/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        card: "var(--color-card)",
        ink: "var(--color-ink)",
        brand: "var(--color-brand)",
        accent: "var(--color-accent)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
      },
      fontFamily: {
        display: ["Poppins", "ui-sans-serif", "system-ui"],
        body: ["Source Sans 3", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1020",
        panel: "#141a2e",
        line: "#2a3354",
        indigo: {
          400: "#9aa7ff",
          500: "#6d7cff",
        },
      },
    },
  },
  plugins: [],
};

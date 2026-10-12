/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      height: {
        dvh: "100dvh",
        svh: "100svh",
        lvh: "100lvh",
      },
      minHeight: {
        dvh: "100dvh",
        svh: "100svh",
        lvh: "100lvh",
      },
      maxHeight: {
        dvh: "100dvh",
        svh: "100svh",
        lvh: "100lvh",
      },
    },
  },
  plugins: [],
};

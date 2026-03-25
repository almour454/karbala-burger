/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        burger: "#d97706",   // warm orange-brown
        mandi: "#f59e0b",   // golden spice
        drinks: "#3b82f6",  // cool blue
        neutral: "#fef9f4", // soft beige
        accent: "#ef4444",  // ketchup red
      },
    },
  },
  plugins: [],
};
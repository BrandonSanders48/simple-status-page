import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        primary: "var(--primary-color)",
        accent: "var(--accent-color)",
        success: "var(--success-color)",
        warning: "var(--warning-color)",
        danger: "var(--error-color)",
      },
    },
  },
  plugins: [],
};

export default config;

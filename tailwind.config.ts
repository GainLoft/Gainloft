import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', '"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "pm-green": "#30a159",
        "pm-red": "#e23939",
        "pm-blue": "#1452f0",
        "pm-border": "#e6e8ea",
        "pm-text": "#0e0f11",
        "pm-secondary": "#77808d",
        "pm-muted": "#aeb4bc",
      },
    },
  },
  plugins: [],
};
export default config;

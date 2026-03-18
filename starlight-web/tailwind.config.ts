import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Starlight colour system
        navy: "#1A1A2E",
        starlight: {
          red: "#C0392B",
          blue: "#2980B9",
          green: "#27AE60",
          amber: "#F39C12",
          bg: "#F4F5F7",
        },
        // Phase pills
        phase: {
          1: "#3498DB",
          2: "#9B59B6",
          3: "#E67E22",
          4: "#E91E63",
          5: "#1ABC9C",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

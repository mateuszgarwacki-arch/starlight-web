import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ── Brand ───────────────────────────────────────────
        // Navy is now the brand blue (was #1A1A2E dark).
        // Every existing `bg-navy`, `text-navy` auto-converts.
        navy: "#7BA4D4",

        // ── Surfaces (dark tonal layering) ──────────────────
        base: "#0c0d14",            // page / sidebar background
        surface: {
          DEFAULT: "#111219",       // cards, panels  (was white)
          dim:     "#0c0d14",       // inset / sunken (was gray-50)
          mid:     "#171820",       // subtle rise    (was gray-100)
          hi:      "#1d1e27",       // elevated       (was gray-200)
          top:     "#23242e",       // highest        (was gray-300)
          bright:  "#2a2c34",       // hover / active (was gray-400+)
        },

        // ── Text ────────────────────────────────────────────
        foreground: "#f0f0f4",      // primary text   (was gray-900)
        muted:      "#9a9aaa",      // secondary      (was gray-500/600)
        faint:      "#6a6a78",      // tertiary       (was gray-300/400)

        // ── Borders ─────────────────────────────────────────
        subtle: "#1e2030",          // default border (was gray-200)

        // ── Status (brightened for dark bg) ─────────────────
        starlight: {
          red:    "#ff716c",        // was #C0392B
          blue:   "#7BA4D4",        // matches navy / brand
          green:  "#4ade80",        // was #27AE60
          amber:  "#fbbf24",        // was #F39C12
          bg:     "#0c0d14",        // backward compat (was #F4F5F7)
          pink:   "#D47BA0",        // NEW — brand accent
        },

        // ── Phase pills (unchanged — work on dark) ─────────
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

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Softer gold in place of Tailwind's bright amber/orange (easier on
        // the eye; matches the logo's gold). Same shade roles as before:
        // 50–200 pale fills, 300 text on dark, 400 dots/borders, 500 buttons,
        // 600+ text on white (600 = #8A6A1F, 5:1 contrast; the old #d97706
        // was 3.2:1).
        amber: {
          50: "#FBF7EE",
          100: "#F5ECD7",
          200: "#EBD9AE",
          300: "#E0C48A",
          400: "#D4B266",
          500: "#C9A550",
          600: "#8A6A1F",
          700: "#6F5418",
          800: "#553F16",
          900: "#3D2D10",
          950: "#241A09",
        },
        navy: {
          950: "#04080f",
          900: "#070d1c",
          800: "#0c1528",
          700: "#111e38",
          600: "#172447",
          500: "#1e2e58",
        },
        gold: {
          DEFAULT: "#C9A550",
          50:  "#fdf8ec",
          100: "#f8eccc",
          200: "#f0d48a",
          300: "#e8bc52",
          400: "#d9a53a",
          500: "#C9A550",
          600: "#a07d32",
          700: "#7a5e22",
          800: "#553f16",
          900: "#2e210a",
        },
        // Operator calendar (Bookings → Calendar). Warm paper, deep ink and a
        // muted brass accent; status colours are the only saturated hues.
        // Mirrored in src/components/operator/calendar/tokens.js.
        cal: {
          paper: "#F6F2EA",
          sheet: "#FFFDF8",
          well: "#EEE7D9",
          line: "#E5DDCC",
          rule: "#D2C7B1",
          ink: "#141821",
          ink2: "#3A3F4A",
          muted: "#6D6656",
          faint: "#8A8170",
          brass: "#9C7B34",
          "brass-ink": "#76591F",
          "brass-soft": "#F2E8CF",
          ok: "#2F6B50",
          "ok-soft": "#E3EEE6",
          alert: "#A3402C",
          "alert-soft": "#F7E4DC",
          road: "#2E5C88",
          "road-soft": "#E1EAF3",
        },
      },
      fontFamily: {
        // One font everywhere (Manrope, src/app/globals.css), including the
        // serif and monospace utilities. The calendar's heading font
        // (font-display) is Manrope too.
        sans: ["Manrope", "system-ui", "sans-serif"],
        serif: ["Manrope", "system-ui", "sans-serif"],
        mono: ["Manrope", "system-ui", "sans-serif"],
        display: ["Manrope", "system-ui", "sans-serif"],
      },
      // Operator calendar type scale and radii (see calendar/tokens.js).
      fontSize: {
        "cal-label": ["10.5px", { lineHeight: "14px", letterSpacing: "0.09em" }],
        "cal-xs": ["12px", { lineHeight: "16px" }],
        "cal-sm": ["13px", { lineHeight: "18px" }],
        "cal-base": ["14px", { lineHeight: "19px" }],
        "cal-time": ["15px", { lineHeight: "19px" }],
        "cal-lg": ["18px", { lineHeight: "23px" }],
        "cal-xl": ["24px", { lineHeight: "28px", letterSpacing: "-0.01em" }],
        "cal-2xl": ["30px", { lineHeight: "34px", letterSpacing: "-0.015em" }],
      },
      borderRadius: {
        cal: "6px",
        "cal-lg": "10px",
      },
      boxShadow: {
        "gold-sm": "0 0 12px rgba(201,165,80,0.15)",
        "gold-md": "0 0 24px rgba(201,165,80,0.25)",
        "card":    "0 4px 20px rgba(15,27,51,0.08)",
        "cal-pop": "0 12px 32px -12px rgba(20,24,33,0.28)",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #C9A550 0%, #E8C97A 50%, #C9A550 100%)",
        "navy-gradient": "linear-gradient(180deg, #0c1528 0%, #070d1c 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
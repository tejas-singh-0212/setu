// Setu — single source of truth for colors & fonts (loaded AFTER Tailwind CDN)
tailwind.config = {
  theme: {
    extend: {
      colors: {
        cream: "#F7F1E8",
        surface: "#FFFFFF",
        brand: { DEFAULT: "#2563EB", dark: "#1D4ED8" },
        ink: "#0F172A",
        muted: "#64748B",
        ok: "#16A34A",
        warn: "#D97706",
        bad: "#DC2626",
        ai: "#7C3AED",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
};

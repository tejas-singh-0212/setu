// Tailwind config — Setu design tokens (unchanged from v1)

const colors = {
  cream: '#F7F1E8',
  surface: '#FFFFFF',
  brand: '#2563EB',
  brandDark: '#1D4ED8',
  ink: '#0F172A',
  muted: '#64748B',
  ok: '#16A34A',
  warn: '#D97706',
  bad: '#DC2626',
  ai: '#7C3AED',
}

module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors,
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

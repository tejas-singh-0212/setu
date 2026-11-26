// Tailwind config — Setu design tokens (unchanged from v1)

const colors = {
  cream: '#F7F1E8',
  surface: '#FFFFFF',
  brand: '#2563EB',
  brandDark: '#1D4ED8',
  'brand-dark': '#1D4ED8', // context.md name for brandDark
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
        // Inter is the product font (context.md §4); make it the default `font-sans`.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 12px 32px -8px rgb(15 23 42 / 0.18), 0 2px 6px rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
}

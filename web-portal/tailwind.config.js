/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'casino-red': '#DC2626',
        'casino-green': '#16A34A',
        'casino-gold': '#F59E0B',
        'casino-dark': '#1F2937',
        'casino-darker': '#111827',
        'casino-accent': '#8B5CF6',
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'casino-gradient': 'linear-gradient(135deg, #1F2937 0%, #111827 50%, #374151 100%)',
      }
    },
  },
  plugins: [],
}
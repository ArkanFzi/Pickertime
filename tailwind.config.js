/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        navy: '#0A0F1D',
        'navy-light': '#0F172A',
        'navy-mid': '#1E293B',
        'electric': '#00D4FF',
        'electric-dim': '#00A3CC',
        'glass-border': 'rgba(255,255,255,0.10)',
        'glass-bg': 'rgba(255,255,255,0.03)',
        'glass-hover': 'rgba(255,255,255,0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

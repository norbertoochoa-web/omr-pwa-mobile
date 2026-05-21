/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js}', './index.html'],
  theme: {
    extend: {
      colors: {
        overlay: {
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
        },
      },
    },
  },
  plugins: [],
};

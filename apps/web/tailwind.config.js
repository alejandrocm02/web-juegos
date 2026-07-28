/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          900: '#070912',
          800: '#0d1020',
          700: '#141a2e',
          600: '#1d2540',
          500: '#2a3454',
        },
        neon: {
          cyan: '#22d3ee',
          pink: '#f472b6',
          amber: '#fbbf24',
          lime: '#4ade80',
          violet: '#a78bfa',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(148,163,184,0.12), 0 18px 40px -20px rgba(34,211,238,0.55)',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        pop: 'pop 180ms ease-out',
        slideUp: 'slideUp 220ms ease-out',
      },
    },
  },
  plugins: [],
};

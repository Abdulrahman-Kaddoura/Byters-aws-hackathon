/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dae6ff',
          200: '#bcd3ff',
          300: '#8eb6ff',
          400: '#588dff',
          500: '#2f66f6',
          600: '#1a4be3',
          700: '#1639c0',
          800: '#18319c',
          900: '#1a2f7c',
          950: '#141d4b',
        },
        teal: {
          50: '#eff3f3',
          100: '#dde7e7',
          200: '#bccece',
          300: '#9ab3b3',
          400: '#799898',
          500: '#55797a',
          600: '#446364',
          700: '#354e4f',
          800: '#293c3d',
          900: '#202f30',
        },
        // Muted, low-saturation status ramps — Tailwind's default emerald/amber/
        // rose/violet are too vivid for the "calm, near-grayscale" design goal.
        // These fully replace the stock families (same shade keys), so every
        // existing bg-emerald-500, dark:text-amber-300, etc. picks them up
        // automatically without touching the ~18 files that reference them.
        emerald: {
          50: '#f1f4f2',
          100: '#e2e8e3',
          200: '#c7d3c9',
          300: '#a9bdac',
          400: '#8aa38f',
          500: '#6e8874',
          600: '#58705f',
          700: '#465a4c',
          800: '#37453b',
          900: '#2b362e',
        },
        amber: {
          50: '#f6f1e8',
          100: '#ede3d0',
          200: '#dcc7a3',
          300: '#c9a978',
          400: '#b58d55',
          500: '#a3763c',
          600: '#855f30',
          700: '#684a26',
          800: '#50391e',
          900: '#3d2c17',
        },
        rose: {
          50: '#f5eeed',
          100: '#ecdcda',
          200: '#d8b7b3',
          300: '#c2938d',
          400: '#ac746c',
          500: '#a15850',
          600: '#834741',
          700: '#673733',
          800: '#4f2b28',
          900: '#3c211f',
        },
        violet: {
          50: '#f1eff3',
          100: '#e2dee9',
          200: '#c6bdd2',
          300: '#a99cba',
          400: '#8f7fa4',
          500: '#7c6a92',
          600: '#64557a',
          700: '#4f4360',
          800: '#3d344b',
          900: '#2e2839',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
        card: '0 1px 3px rgba(16, 24, 40, 0.05), 0 4px 16px -4px rgba(16, 24, 40, 0.08)',
        lift: '0 8px 30px -8px rgba(16, 24, 40, 0.16)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'pulse-soft': 'pulse-soft 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

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
          50: '#effcf9',
          100: '#c9f5ec',
          200: '#94ebd9',
          300: '#57d9c2',
          400: '#2bbfa8',
          500: '#12a38f',
          600: '#0a8375',
          700: '#0c695f',
          800: '#0e544d',
          900: '#104640',
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

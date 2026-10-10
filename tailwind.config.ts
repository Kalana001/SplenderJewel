import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        luxury: {
          black: '#0A0A0A',
          charcoal: '#141414',
          surface: '#1A1A1A',
          card: '#18181B',
          border: '#27272A',
          'border-light': '#E4E4E7',
          gold: {
            DEFAULT: '#D4AF37',
            light: '#F3E5AB',
            muted: '#C5A059',
            dark: '#997A15',
            hover: '#E5C158',
          },
          cream: '#FAF9F6',
          sand: '#F5F2EB',
          subtle: '#71717A',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;

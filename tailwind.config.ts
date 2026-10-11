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
          ruby: {
            DEFAULT: '#A31145',
            light: '#D4236A',
            dark: '#6E082B',
            muted: '#851239',
            glow: 'rgba(163, 17, 69, 0.35)',
          },
          cream: '#FAF9F6',
          sand: '#F5F2EB',
          subtle: '#71717A',
        },
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #F3E5AB 0%, #D4AF37 50%, #997A15 100%)',
        'ruby-gradient': 'linear-gradient(135deg, #D4236A 0%, #A31145 50%, #6E082B 100%)',
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

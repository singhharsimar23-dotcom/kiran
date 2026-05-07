import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kbg:     '#050C17',
        ks1:     '#0A1628',
        ks2:     '#0F2040',
        ks3:     '#162840',
        kborder: '#1B3455',
        ktp:     '#E2F0FF',
        kts:     '#6B9EC4',
        ktm:     '#3A5F80',
        kcyan:   '#22D3EE',
        kamber:  '#F59E0B',
        kgreen:  '#22C55E',
        kred:    '#EF4444',
        kpurple: '#A78BFA',
      },
      fontFamily: {
        syne: ['var(--font-syne)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      keyframes: {
        blink: {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.5' },
        },
        fadein: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        blink:  'blink 2s infinite',
        fadein: 'fadein 0.3s ease',
      },
    },
  },
  plugins: [],
}
export default config

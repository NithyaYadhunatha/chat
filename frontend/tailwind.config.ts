import type { Config } from 'tailwindcss';

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    // Square everything — this is an arcade cabinet, not a bubble app.
    borderRadius: {
      none: '0px', sm: '0px', DEFAULT: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px', '3xl': '0px', full: '0px',
    },
    extend: {
      colors: {
        bg: c('background'),
        surface: c('surface'),
        raised: c('raised'),
        table: c('table'),
        'table-deep': c('table-deep'),
        line: c('line'),
        'line-strong': c('line-strong'),
        fg: c('foreground'),
        muted: c('muted'),
        faint: c('faint'),
        ball: c('ball'),
        'ball-ink': c('ball-ink'),
        them: c('them'),
        ok: c('ok'),
        warn: c('warn'),
        danger: c('danger'),
        primary: c('ball'),
        'primary-fg': c('ball-ink'),
      },
      fontFamily: {
        sans: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        pixel: ['var(--font-pixel)', 'var(--font-mono)', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        ball: 'none',
        lift: 'none',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0' }, to: { opacity: '1' } },
        blink: { '0%, 49%': { opacity: '1' }, '50%, 100%': { opacity: '0' } },
        'rally-x': { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(var(--rally-distance, 200px))' } },
        'rally-y': { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(var(--rally-height, -60px))' } },
        bounce: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'pop-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up 90ms steps(2)',
        blink: 'blink 1s steps(1) infinite',
        'rally-x': 'rally-x 1.4s linear infinite alternate',
        'rally-y': 'rally-y 0.7s linear infinite',
        bounce: 'bounce 0.5s steps(2) infinite',
        'pop-in': 'pop-in 80ms steps(2)',
      },
    },
  },
  plugins: [],
};

export default config;

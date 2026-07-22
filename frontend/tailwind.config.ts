import type { Config } from 'tailwindcss';

// Los colores/radios/sombras viven como variables CSS en src/styles/tokens.css
// (claro + oscuro cinematográfico). Tailwind solo las referencia — una única
// fuente de verdad para el sistema de diseño, consumible también fuera de
// clases utilitarias (SVG, inline styles de gráficos, etc.).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-faint': 'var(--ink-faint)',
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-glass': 'var(--surface-glass)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        brand: {
          DEFAULT: 'var(--brand)',
          700: 'var(--brand-700)',
          900: 'var(--brand-900)',
          tint: 'var(--brand-tint)',
        },
        ai: {
          DEFAULT: 'var(--ai)',
          700: 'var(--ai-700)',
          tint: 'var(--ai-tint)',
        },
        warn: { DEFAULT: 'var(--warn)', tint: 'var(--warn-tint)' },
        danger: { DEFAULT: 'var(--danger)', tint: 'var(--danger-tint)' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.22,1,.36,1)',
        'spring-out': 'cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [],
} satisfies Config;

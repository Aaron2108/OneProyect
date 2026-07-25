import type { Config } from 'tailwindcss';

// Los colores/radios/sombras viven como variables CSS en src/styles/tokens.css
// (un solo modo, oscuro premium). Tailwind solo las referencia — una única
// fuente de verdad para el sistema de diseño, consumible también fuera de
// clases utilitarias (SVG, inline styles de gráficos, etc.).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-faint': 'var(--ink-faint)',
        'ink-disabled': 'var(--ink-disabled)',
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-glass': 'var(--surface-glass)',
        sidebar: 'var(--sidebar-bg)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        brand: {
          DEFAULT: 'var(--brand)',
          700: 'var(--brand-700)',
          hover: 'var(--brand-hover)',
          tint: 'var(--brand-tint)',
          on: 'var(--on-brand)',
        },
        ai: {
          DEFAULT: 'var(--ai)',
          700: 'var(--ai-700)',
          hover: 'var(--ai-hover)',
          tint: 'var(--ai-tint)',
        },
        success: { DEFAULT: 'var(--success)', tint: 'var(--success-tint)' },
        warn: { DEFAULT: 'var(--warn)', tint: 'var(--warn-tint)' },
        danger: { DEFAULT: 'var(--danger)', tint: 'var(--danger-tint)' },
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
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
      transitionDuration: {
        fast: '180ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
